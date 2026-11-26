import {
  DRIVE_ROOT_FOLDER_ID,
  DriveDocumentItem,
  DriveFileCategory,
  DriveTargetModule,
} from '../types';

interface DriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  parents?: string[];
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const GDOC_MIME = 'application/vnd.google-apps.document';
const GSLIDES_MIME = 'application/vnd.google-apps.presentation';

export function classifyCategory(mimeType: string, name: string): DriveFileCategory {
  const m = (mimeType || '').toLowerCase();
  const n = (name || '').toLowerCase();

  if (m === FOLDER_MIME) return 'Carpeta';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'PDF';
  if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(n)) return 'Imagen';
  if (
    m === GSLIDES_MIME ||
    m.includes('presentation') ||
    m.includes('powerpoint') ||
    /\.(pptx?|odp)$/i.test(n)
  ) {
    return 'Presentación';
  }
  if (
    m === GSHEET_MIME ||
    m.includes('spreadsheet') ||
    m.includes('excel') ||
    m === 'text/csv' ||
    /\.(xlsx?|csv|ods)$/i.test(n)
  ) {
    return 'Hoja de cálculo';
  }
  if (
    m === GDOC_MIME ||
    m.includes('wordprocessing') ||
    m.includes('msword') ||
    /\.(docx?|odt|txt)$/i.test(n)
  ) {
    return 'Documento';
  }
  if (m.startsWith('video/') || /\.(mp4|mov|webm|avi)$/i.test(n)) return 'Video';
  return 'Otro';
}

export function classifyTargetModule(folderPath: string, fileName: string): DriveTargetModule {
  const combined = `${folderPath} ${fileName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    combined.includes('paciente') ||
    combined.includes('nominal') ||
    combined.includes('seguimiento') ||
    combined.includes('padron')
  ) {
    return 'pacientes';
  }
  if (
    combined.includes('calidad') ||
    combined.includes('observacion') ||
    combined.includes('consistencia') ||
    combined.includes('auditoria')
  ) {
    return 'calidad';
  }
  if (
    combined.includes('morb') ||
    combined.includes('cie10') ||
    combined.includes('cie-10') ||
    combined.includes('diagnostico') ||
    combined.includes('enfermedad')
  ) {
    return 'morbilidades';
  }
  if (
    combined.includes('indicador') ||
    combined.includes('meta') ||
    combined.includes('cobertura') ||
    combined.includes('avance') ||
    combined.includes('desempeno')
  ) {
    return 'indicadores';
  }
  if (
    combined.includes('cartilla') ||
    combined.includes('his') ||
    combined.includes('guia') ||
    combined.includes('manual') ||
    combined.includes('norma') ||
    combined.includes('capacitacion')
  ) {
    return 'cartilla';
  }
  return 'general';
}

async function listFolderChildren(
  folderId: string,
  accessToken: string
): Promise<DriveApiFile[]> {
  const files: DriveApiFile[] = [];
  let pageToken: string | undefined;

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,thumbnailLink,parents)'
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg =
        errBody?.error?.message ||
        `Error ${res.status} al consultar Google Drive. Verifique permisos de lectura sobre la carpeta.`;
      throw new Error(msg);
    }

    const data = (await res.json()) as {
      files?: DriveApiFile[];
      nextPageToken?: string;
    };

    if (Array.isArray(data.files)) {
      files.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

export async function listDriveRepositoryFiles(
  accessToken: string,
  syncedBy: string,
  rootFolderId = DRIVE_ROOT_FOLDER_ID
): Promise<DriveDocumentItem[]> {
  const collected: DriveDocumentItem[] = [];
  const queue: { id: string; path: string; depth: number }[] = [
    { id: rootFolderId, path: 'Curso de Vida Adulto', depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = await listFolderChildren(current.id, accessToken);

    for (const item of children) {
      if (item.mimeType === FOLDER_MIME) {
        if (current.depth < 3) {
          queue.push({
            id: item.id,
            path: `${current.path} / ${item.name}`.slice(0, 300),
            depth: current.depth + 1,
          });
        }
        continue;
      }

      const category = classifyCategory(item.mimeType, item.name);
      const targetModule = classifyTargetModule(current.path, item.name);
      collected.push({
        fileId: item.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
        name: item.name.slice(0, 240),
        mimeType: (item.mimeType || 'application/octet-stream').slice(0, 160),
        category,
        targetModule,
        folderPath: current.path.slice(0, 300),
        sizeBytes: Number(item.size || 0),
        modifiedTime: (item.modifiedTime || new Date().toISOString()).slice(0, 64),
        webViewLink: (
          item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`
        ).slice(0, 600),
        webContentLink: item.webContentLink,
        thumbnailLink: item.thumbnailLink,
        syncedBy: syncedBy.slice(0, 160),
      });
    }
  }

  return collected.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
}

export async function fetchDriveFileBlob(
  file: DriveDocumentItem,
  accessToken: string
): Promise<Blob> {
  let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    file.fileId
  )}?alt=media&supportsAllDrives=true`;

  if (file.mimeType === GSHEET_MIME) {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.fileId
    )}/export?mimeType=${encodeURIComponent(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )}`;
  } else if (file.mimeType === GDOC_MIME || file.mimeType === GSLIDES_MIME) {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.fileId
    )}/export?mimeType=application/pdf`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`No se pudo descargar el archivo desde Google Drive (${res.status}): ${errText.slice(0, 140)}`);
  }

  return await res.blob();
}

export async function downloadDriveSpreadsheetAsFile(
  file: DriveDocumentItem,
  accessToken: string
): Promise<File> {
  const blob = await fetchDriveFileBlob(file, accessToken);
  const safeName = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')
    ? file.name
    : `${file.name}.xlsx`;
  return new File([blob], safeName, { type: blob.type });
}

export function getDriveEmbedPreviewUrl(file: DriveDocumentItem): string {
  // Validated safe Google Drive preview URL
  const safeId = encodeURIComponent(file.fileId);
  return `https://drive.google.com/file/d/${safeId}/preview`;
}
