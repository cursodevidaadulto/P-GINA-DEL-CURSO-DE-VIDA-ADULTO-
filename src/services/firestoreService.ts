import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAILS,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  CartillaResource,
  DataModuleKey,
  NominalManifest,
  NominalModuleKey,
  NominalRecord,
  PublicManifest,
  PublicModuleKey,
  UploadHistoryItem,
  UserProfile,
} from '../types';
import { AnalyzedExcelResult } from './excelAnalyzers';

const CHUNK_SIZE = 250;

function makeVersionId(prefix: string): string {
  const clean = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${clean}_${Date.now()}`;
}

export async function ensureUserProfile(firebaseUser: User): Promise<UserProfile> {
  const userPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);
  const email = (firebaseUser.email || '').toLowerCase();
  const isBootAdmin =
    Boolean(firebaseUser.emailVerified) && BOOTSTRAPPED_ADMIN_EMAILS.includes(email);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      return {
        ...data,
        role: isBootAdmin ? 'admin' : data.role,
        nominalAccess: isBootAdmin ? true : data.nominalAccess,
      };
    }

    const newProfile = {
      uid: firebaseUser.uid,
      email: (firebaseUser.email || 'usuario@rissignacio.gob.pe').slice(0, 200),
      displayName: (firebaseUser.displayName || email.split('@')[0] || 'Personal RIS').slice(
        0,
        160
      ),
      role: isBootAdmin ? 'admin' : 'consultor',
      nominalAccess: isBootAdmin,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, newProfile);
    return {
      ...newProfile,
      role: newProfile.role as 'admin' | 'consultor',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function fetchAllPublicManifests(): Promise<
  Partial<Record<PublicModuleKey, PublicManifest>>
> {
  const path = 'public_manifests';
  try {
    const snap = await getDocs(collection(db, path));
    const map: Partial<Record<PublicModuleKey, PublicManifest>> = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() as PublicManifest;
      map[data.module] = data;
    });
    return map;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchPublicBatchRows<T = Record<string, unknown>>(
  manifest: PublicManifest | undefined
): Promise<T[]> {
  if (!manifest || !manifest.batchIds || manifest.batchIds.length === 0) return [];
  const allRows: T[] = [];
  for (const batchId of manifest.batchIds) {
    const path = `public_batches/${batchId}`;
    try {
      const snap = await getDoc(doc(db, 'public_batches', batchId));
      if (snap.exists()) {
        const data = snap.data() as { rows?: T[] };
        if (Array.isArray(data.rows)) {
          allRows.push(...data.rows);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
  return allRows;
}

export async function fetchNominalModuleData(
  module: NominalModuleKey
): Promise<{ manifest: NominalManifest | null; rows: NominalRecord[] }> {
  const manifestPath = `nominal_manifests/${module}`;
  try {
    const manifestSnap = await getDoc(doc(db, 'nominal_manifests', module));
    if (!manifestSnap.exists()) {
      return { manifest: null, rows: [] };
    }
    const manifest = manifestSnap.data() as NominalManifest;
    const rows: NominalRecord[] = [];
    for (const batchId of manifest.batchIds || []) {
      const batchPath = `nominal_batches/${batchId}`;
      try {
        const batchSnap = await getDoc(doc(db, 'nominal_batches', batchId));
        if (batchSnap.exists()) {
          const batchData = batchSnap.data() as { rows?: NominalRecord[] };
          if (Array.isArray(batchData.rows)) {
            rows.push(...batchData.rows);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, batchPath);
      }
    }
    return { manifest, rows };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, manifestPath);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms = 4500, label = 'Operación'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} excedió el tiempo de espera.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function publishAnalyzedDataset(
  analysis: AnalyzedExcelResult,
  user: UserProfile
): Promise<void> {
  const versionId = makeVersionId(analysis.module);
  const publicModuleKey: PublicModuleKey =
    analysis.module === 'pacientes'
      ? 'pacientes_resumen'
      : analysis.module === 'calidad'
      ? 'calidad_resumen'
      : analysis.module;

  // 1. Write public batches in parallel (groups of 5)
  const publicBatchIds: string[] = [];
  const publicChunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < analysis.publicRows.length; i += CHUNK_SIZE) {
    publicChunks.push(analysis.publicRows.slice(i, i + CHUNK_SIZE));
  }
  if (publicChunks.length === 0) {
    publicChunks.push([]);
  }

  for (let i = 0; i < publicChunks.length; i += 5) {
    const slice = publicChunks.slice(i, i + 5);
    const batch = writeBatch(db);
    slice.forEach((rows, offset) => {
      const idx = i + offset;
      const batchId = `pub_${publicModuleKey}_${versionId}_${idx}`;
      publicBatchIds.push(batchId);
      batch.set(doc(db, 'public_batches', batchId), {
        module: publicModuleKey,
        versionId,
        chunkIndex: idx,
        rows,
        createdAt: serverTimestamp(),
      });
    });
    try {
      await withTimeout(batch.commit(), 5000, 'Publicación de lotes públicos');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `public_batches/${publicModuleKey}`);
    }
  }

  // 2. Write public manifest
  const pubManifestPath = `public_manifests/${publicModuleKey}`;
  try {
    await withTimeout(
      setDoc(doc(db, 'public_manifests', publicModuleKey), {
        module: publicModuleKey,
        versionId,
        isDemo: false,
        fileName: analysis.fileName.slice(0, 240),
        rowCount: analysis.rowCount,
        establishmentCount: analysis.establishmentCount,
        microredCount: analysis.microredCount,
        batchIds: publicBatchIds.slice(0, 100),
        summary: analysis.summary,
        updatedBy: user.displayName.slice(0, 160),
        updatedAt: serverTimestamp(),
      }),
      4500,
      'Manifiesto público'
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pubManifestPath);
  }

  // 3. If nominal module, write nominal batches in parallel groups + nominal manifest
  const nominalBatchIds: string[] = [];
  if (analysis.module === 'pacientes' || analysis.module === 'calidad') {
    const nominalChunks: NominalRecord[][] = [];
    for (let i = 0; i < analysis.nominalRows.length; i += CHUNK_SIZE) {
      nominalChunks.push(analysis.nominalRows.slice(i, i + CHUNK_SIZE));
    }
    if (nominalChunks.length === 0) nominalChunks.push([]);

    for (let i = 0; i < nominalChunks.length; i += 5) {
      const slice = nominalChunks.slice(i, i + 5);
      const batch = writeBatch(db);
      slice.forEach((rows, offset) => {
        const idx = i + offset;
        const batchId = `nom_${analysis.module}_${versionId}_${idx}`;
        nominalBatchIds.push(batchId);
        batch.set(doc(db, 'nominal_batches', batchId), {
          module: analysis.module,
          versionId,
          chunkIndex: idx,
          rows,
          createdAt: serverTimestamp(),
        });
      });
      try {
        await withTimeout(batch.commit(), 5000, 'Publicación de lotes nominales');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `nominal_batches/${analysis.module}`);
      }
    }

    const nomManifestPath = `nominal_manifests/${analysis.module}`;
    try {
      await withTimeout(
        setDoc(doc(db, 'nominal_manifests', analysis.module), {
          module: analysis.module,
          versionId,
          isDemo: false,
          fileName: analysis.fileName.slice(0, 240),
          rowCount: analysis.rowCount,
          batchIds: nominalBatchIds.slice(0, 100),
          columnHeaders: analysis.columnHeaders.slice(0, 60),
          updatedBy: user.displayName.slice(0, 160),
          updatedAt: serverTimestamp(),
        }),
        4500,
        'Manifiesto nominal'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, nomManifestPath);
    }
  }

  // 4. Write upload history entry
  const historyId = `hist_${versionId}`;
  const historyPath = `upload_history/${historyId}`;
  try {
    await withTimeout(
      setDoc(doc(db, 'upload_history', historyId), {
        historyId,
        module: analysis.module as DataModuleKey,
        versionId,
        fileName: analysis.fileName.slice(0, 240),
        rowCount: analysis.rowCount,
        duplicateCount: analysis.duplicateCount,
        status: 'Publicado',
        validationNotes: analysis.validationNotes.slice(0, 600),
        uploadedByUid: user.uid,
        uploadedByName: user.displayName.slice(0, 160),
        uploadedAt: serverTimestamp(),
        batchIds: (nominalBatchIds.length ? nominalBatchIds : publicBatchIds).slice(0, 100),
      }),
      4500,
      'Historial de carga'
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, historyPath);
  }
}

export async function fetchPublishedCartillaResources(): Promise<CartillaResource[]> {
  const path = 'cartilla_resources';
  try {
    const q = query(collection(db, path), where('published', '==', true), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CartillaResource);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAdminCartillaResources(): Promise<CartillaResource[]> {
  const path = 'cartilla_resources';
  try {
    const snap = await getDocs(query(collection(db, path), limit(100)));
    return snap.docs.map((d) => d.data() as CartillaResource);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveCartillaResource(
  resource: Omit<CartillaResource, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `cartilla_resources/${resource.resourceId}`;
  try {
    const payload = {
      resourceId: resource.resourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
      title: resource.title.trim().slice(0, 200),
      topic: resource.topic,
      resourceType: resource.resourceType,
      summary: resource.summary.trim().slice(0, 600),
      content: resource.content.trim().slice(0, 12000),
      hisCodes: (resource.hisCodes || []).slice(0, 40),
      ...(resource.fileUrl ? { fileUrl: resource.fileUrl.trim().slice(0, 800) } : {}),
      published: Boolean(resource.published),
      authorUid: resource.authorUid,
      updatedAt: serverTimestamp(),
    };

    if (isNew) {
      await setDoc(doc(db, 'cartilla_resources', payload.resourceId), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'cartilla_resources', payload.resourceId), payload);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteCartillaResource(resourceId: string): Promise<void> {
  const path = `cartilla_resources/${resourceId}`;
  try {
    await deleteDoc(doc(db, 'cartilla_resources', resourceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, path), limit(200)));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateUserAccess(
  targetUser: UserProfile,
  updates: Partial<Pick<UserProfile, 'nominalAccess' | 'active' | 'role'>>
): Promise<void> {
  const path = `users/${targetUser.uid}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', targetUser.uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchUploadHistory(): Promise<UploadHistoryItem[]> {
  const path = 'upload_history';
  try {
    const snap = await getDocs(
      query(collection(db, path), orderBy('uploadedAt', 'desc'), limit(50))
    );
    return snap.docs.map((d) => d.data() as UploadHistoryItem);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchDriveCatalog(): Promise<import('../types').DriveDocumentItem[]> {
  const path = 'drive_catalog';
  try {
    const snap = await getDocs(query(collection(db, path), limit(250)));
    return snap.docs.map((d) => d.data() as import('../types').DriveDocumentItem);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveDriveCatalogToFirestore(
  items: import('../types').DriveDocumentItem[],
  syncedBy: string
): Promise<void> {
  const existingSnap = await getDocs(query(collection(db, 'drive_catalog'), limit(250)));
  const incomingIds = new Set(items.map((i) => i.fileId));

  // Remove deleted Drive files from catalog
  const toDelete = existingSnap.docs.filter((d) => !incomingIds.has(d.id));
  for (let i = 0; i < toDelete.length; i += 200) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 200).forEach((d) => batch.delete(d.ref));
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'drive_catalog');
    }
  }

  // Upsert synced files
  for (let i = 0; i < items.length; i += 200) {
    const batch = writeBatch(db);
    items.slice(i, i + 200).forEach((item) => {
      const safeId = item.fileId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
      batch.set(doc(db, 'drive_catalog', safeId), {
        fileId: safeId,
        name: item.name.slice(0, 240),
        mimeType: item.mimeType.slice(0, 160),
        category: item.category,
        targetModule: item.targetModule,
        folderPath: item.folderPath.slice(0, 300),
        sizeBytes: Math.max(0, Number(item.sizeBytes) || 0),
        modifiedTime: item.modifiedTime.slice(0, 64),
        webViewLink: item.webViewLink.slice(0, 600),
        syncedBy: syncedBy.slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'drive_catalog');
    }
  }

  // Update repository sync state
  const syncPath = 'drive_sync_state/repositorio';
  try {
    await setDoc(doc(db, 'drive_sync_state', 'repositorio'), {
      module: 'repositorio',
      driveFileId: '1YgxzUACQqjVBifrU9_Q5F-EyFT-X36Am',
      fileName: 'Carpeta Central Google Drive',
      mimeType: 'application/vnd.google-apps.folder',
      modifiedTime: new Date().toISOString().slice(0, 64),
      lastCheckedAt: new Date().toISOString().slice(0, 64),
      validationStatus: 'ok',
      rowCount: items.length,
      updatedBy: syncedBy.slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, syncPath);
  }
}

export async function fetchDriveSyncStates(): Promise<
  Record<string, import('../types').DriveSyncState>
> {
  const path = 'drive_sync_state';
  try {
    const snap = await getDocs(collection(db, path));
    const map: Record<string, import('../types').DriveSyncState> = {};
    snap.forEach((d) => {
      const data = d.data() as import('../types').DriveSyncState;
      map[data.module] = data;
    });
    return map;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveDriveSyncState(
  state: Omit<import('../types').DriveSyncState, 'updatedAt'>
): Promise<void> {
  const path = `drive_sync_state/${state.module}`;
  try {
    await setDoc(doc(db, 'drive_sync_state', state.module), {
      ...state,
      driveFileId: state.driveFileId.slice(0, 160),
      fileName: state.fileName.slice(0, 240),
      mimeType: state.mimeType.slice(0, 160),
      modifiedTime: state.modifiedTime.slice(0, 64),
      lastCheckedAt: state.lastCheckedAt.slice(0, 64),
      updatedBy: state.updatedBy.slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

