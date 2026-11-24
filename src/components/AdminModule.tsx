import React, { useEffect, useState } from 'react';
import {
  BookPlus,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Lock,
  ShieldAlert,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  analyzeExcelFile,
  AnalyzedExcelResult,
  exportRowsToExcel,
} from '../services/excelAnalyzers';
import {
  deleteCartillaResource,
  fetchAdminCartillaResources,
  fetchAllUsers,
  fetchUploadHistory,
  publishAnalyzedDataset,
  saveCartillaResource,
  updateUserAccess,
} from '../services/firestoreService';
import {
  CartillaResource,
  CartillaResourceType,
  CartillaTopic,
  DataModuleKey,
  UploadHistoryItem,
  UserProfile,
} from '../types';

interface AdminModuleProps {
  user: UserProfile | null;
  onOpenAuth: () => void;
  onDataPublished: () => Promise<void>;
}

type AdminTab = 'carga' | 'usuarios' | 'cartilla' | 'historial';

const SAMPLE_TEMPLATES: Record<DataModuleKey, Record<string, unknown>[]> = {
  indicadores: [
    {
      Microred: 'San Ignacio',
      IPRESS: 'C.S. San Ignacio',
      Indicador: 'Paquete de Atención Integral del Adulto (30-59 años)',
      Numerador: 420,
      Denominador: 520,
      Meta_Pct: 75,
    },
    {
      Microred: 'Chirinos',
      IPRESS: 'C.S. Chirinos',
      Indicador: 'Tamizaje de Enfermedades No Transmisibles (HTA/DM)',
      Numerador: 285,
      Denominador: 390,
      Meta_Pct: 75,
    },
  ],
  morbilidades: [
    {
      Microred: 'San Ignacio',
      IPRESS: 'C.S. San Ignacio',
      Codigo_CIE10: 'I10X',
      Diagnostico: 'Hipertensión esencial (primaria)',
      Femenino: 142,
      Masculino: 108,
      Total: 250,
    },
    {
      Microred: 'La Coipa',
      IPRESS: 'C.S. La Coipa',
      Codigo_CIE10: 'E119',
      Diagnostico: 'Diabetes mellitus no insulinodependiente',
      Femenino: 88,
      Masculino: 64,
      Total: 152,
    },
  ],
  calidad: [
    {
      Microred: 'San Ignacio',
      IPRESS: 'C.S. San Ignacio',
      Fecha: '2026-11-20',
      Codigo_HIS: 'C8002',
      Observacion: 'Conforme',
    },
    {
      Microred: 'Huarango',
      IPRESS: 'C.S. Huarango',
      Fecha: '2026-11-20',
      Codigo_HIS: '82947',
      Observacion: 'Observado: Falta campo LAB (N/A)',
    },
  ],
  pacientes: [
    {
      Microred: 'San Ignacio',
      IPRESS: 'C.S. San Ignacio',
      DNI: '40123456',
      Paciente: 'Ejemplo Adulto 1',
      Edad: 44,
      Estado_Paquete: 'Completo (TA)',
      Tamizaje_ENT: 'Si',
      Salud_Mental: 'Si',
    },
    {
      Microred: 'Tamborapa',
      IPRESS: 'P.S. Tamborapa',
      DNI: '41234567',
      Paciente: 'Ejemplo Adulto 2',
      Edad: 37,
      Estado_Paquete: 'Iniciado (1)',
      Tamizaje_ENT: 'Si',
      Salud_Mental: 'Pendiente',
    },
  ],
};

export const AdminModule: React.FC<AdminModuleProps> = ({
  user,
  onOpenAuth,
  onDataPublished,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('carga');
  const [selectedModule, setSelectedModule] = useState<DataModuleKey>('indicadores');
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzedExcelResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [historyList, setHistoryList] = useState<UploadHistoryItem[]>([]);
  const [cartillaList, setCartillaList] = useState<CartillaResource[]>([]);
  const [loadingSubTab, setLoadingSubTab] = useState(false);

  // Cartilla form state
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState<CartillaTopic>('Códigos HIS');
  const [newType, setNewType] = useState<CartillaResourceType>('Guía HIS');
  const [newSummary, setNewSummary] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCodes, setNewCodes] = useState('');
  const [savingCartilla, setSavingCartilla] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    async function loadSubTabData() {
      setLoadingSubTab(true);
      try {
        if (activeTab === 'usuarios') {
          const users = await fetchAllUsers();
          if (active) setUsersList(users);
        } else if (activeTab === 'historial') {
          const hist = await fetchUploadHistory();
          if (active) setHistoryList(hist);
        } else if (activeTab === 'cartilla') {
          const list = await fetchAdminCartillaResources();
          if (active) setCartillaList(list);
        }
      } catch (err) {
        if (active) {
          setStatusMessage({
            type: 'error',
            text: err instanceof Error ? err.message : 'Error cargando datos administrativos.',
          });
        }
      } finally {
        if (active) setLoadingSubTab(false);
      }
    }
    loadSubTabData();
    return () => {
      active = false;
    };
  }, [activeTab, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center max-w-xl mx-auto mt-6">
        <div className="w-12 h-12 rounded-2xl bg-[#123B72]/10 text-[#123B72] flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="font-display text-xl font-bold text-[#123B72] mb-2">
          Panel de Administración Protegido
        </h1>
        <p className="text-[14px] text-slate-600 leading-relaxed mb-6">
          Esta sección está reservada exclusivamente para la coordinación y administración del Curso
          de Vida Adulto de la RIS San Ignacio.
        </p>
        {!user ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl cursor-pointer"
          >
            <span>Iniciar sesión con cuenta autorizada</span>
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 text-[13px] text-[#C74747] bg-[#C74747]/10 px-4 py-2.5 rounded-xl font-medium">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>La cuenta {user.email} tiene rol Consultor sin permisos de administración.</span>
          </div>
        )}
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setStatusMessage(null);
    setAnalysis(null);
    try {
      const result = await analyzeExcelFile(file, selectedModule);
      setAnalysis(result);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al analizar el archivo Excel.',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePublish = async () => {
    if (!analysis || !user) return;
    setPublishing(true);
    setStatusMessage(null);
    try {
      await publishAnalyzedDataset(analysis, user);
      await onDataPublished();
      setStatusMessage({
        type: 'success',
        text: `Publicado correctamente en Firestore (${analysis.rowCount} filas procesadas para ${analysis.module}).`,
      });
      setAnalysis(null);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error publicando en Firestore.',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleNominal = async (target: UserProfile) => {
    try {
      const next = !target.nominalAccess;
      await updateUserAccess(target, { nominalAccess: next });
      setUsersList((prev) =>
        prev.map((u) => (u.uid === target.uid ? { ...u, nominalAccess: next } : u))
      );
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo actualizar el permiso.',
      });
    }
  };

  const handleCreateCartilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim() || !newContent.trim()) return;
    setSavingCartilla(true);
    setStatusMessage(null);
    try {
      const resourceId = `guia_${Date.now()}`;
      const hisCodes = newCodes
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      await saveCartillaResource(
        {
          resourceId,
          title: newTitle.trim(),
          topic: newTopic,
          resourceType: newType,
          summary: newSummary.trim() || newContent.trim().slice(0, 140),
          content: newContent.trim(),
          hisCodes,
          published: true,
          authorUid: user.uid,
        },
        true
      );
      const updated = await fetchAdminCartillaResources();
      setCartillaList(updated);
      await onDataPublished();
      setNewTitle('');
      setNewSummary('');
      setNewContent('');
      setNewCodes('');
      setStatusMessage({ type: 'success', text: 'Recurso publicado en Cartilla HIS.' });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo guardar el recurso.',
      });
    } finally {
      setSavingCartilla(false);
    }
  };

  const handleDeleteCartilla = async (resourceId: string) => {
    try {
      await deleteCartillaResource(resourceId);
      setCartillaList((prev) => prev.filter((c) => c.resourceId !== resourceId));
      await onDataPublished();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo eliminar el recurso.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#123B72]">
            Administración de Plataforma RIS San Ignacio
          </h1>
          <p className="text-[13.5px] text-slate-600 mt-1">
            Sincronización de archivos Excel, gestión de accesos nominales, Cartilla HIS y auditoría
            de versiones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[#F5F3EE] p-1 rounded-xl border border-slate-200/80">
          {[
            { id: 'carga', label: 'Carga Excel', icon: Upload },
            { id: 'usuarios', label: 'Accesos Nominales', icon: Users },
            { id: 'cartilla', label: 'Cartilla HIS', icon: BookPlus },
            { id: 'historial', label: 'Historial', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-[#123B72] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border text-[13.5px] font-medium flex items-center gap-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-[#25804A]/10 border-[#25804A]/25 text-[#25804A]'
              : 'bg-[#C74747]/10 border-[#C74747]/25 text-[#C74747]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* TAB 1: EXCEL UPLOAD */}
      {activeTab === 'carga' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#123B57]">
                1. Seleccione módulo y archivo Excel (.xlsx / .csv)
              </h2>
              <button
                type="button"
                onClick={() =>
                  exportRowsToExcel(
                    SAMPLE_TEMPLATES[selectedModule],
                    `Plantilla_${selectedModule}_RIS_San_Ignacio`,
                    selectedModule
                  )
                }
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#123B72] hover:underline cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar plantilla ejemplo</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  { id: 'indicadores', label: 'Indicadores' },
                  { id: 'morbilidades', label: 'Morbilidades' },
                  { id: 'calidad', label: 'Control Calidad' },
                  { id: 'pacientes', label: 'Pacientes' },
                ] as { id: DataModuleKey; label: string }[]
              ).map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    setSelectedModule(mod.id);
                    setAnalysis(null);
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-all cursor-pointer ${
                    selectedModule === mod.id
                      ? 'bg-[#123B72] text-white border-[#123B72]'
                      : 'bg-[#F5F3EE]/70 text-[#123B57] border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {mod.label}
                </button>
              ))}
            </div>

            <label className="block border-2 border-dashed border-slate-300 hover:border-[#123B72] rounded-2xl p-8 text-center transition-colors cursor-pointer bg-[#F5F3EE]/40">
              <FileSpreadsheet className="w-10 h-10 text-[#123B72] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#123B57]">
                {analyzing
                  ? 'Analizando estructura del archivo...'
                  : 'Haga clic para seleccionar archivo .xlsx, .xls o .csv'}
              </p>
              <p className="text-[12.5px] text-slate-500 mt-1">
                Se eliminarán duplicados y se aislarán los datos personales automáticamente.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#123B57] mb-3">
                2. Validación previa y publicación
              </h2>
              {!analysis ? (
                <div className="py-10 text-center text-slate-500 text-[13.5px]">
                  <Database className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
                  <p>Cargue un archivo Excel para previsualizar el análisis antes de publicar.</p>
                </div>
              ) : (
                <div className="space-y-3 text-[13px]">
                  <div className="p-3.5 rounded-xl bg-[#F5F3EE] border border-slate-200/80 space-y-1.5">
                    <p className="font-bold text-[#123B72] truncate">{analysis.fileName}</p>
                    <p className="text-slate-600">{analysis.validationNotes}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl border border-slate-200">
                      <p className="text-[11.5px] text-slate-500">Filas válidas</p>
                      <p className="font-mono-tabular text-lg font-bold text-[#123B72]">
                        {analysis.rowCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200">
                      <p className="text-[11.5px] text-slate-500">Duplicados omitidos</p>
                      <p className="font-mono-tabular text-lg font-bold text-[#123B57]">
                        {analysis.duplicateCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200">
                      <p className="text-[11.5px] text-slate-500">Establecimientos</p>
                      <p className="font-mono-tabular text-lg font-bold text-[#25804A]">
                        {analysis.establishmentCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200">
                      <p className="text-[11.5px] text-slate-500">Microredes</p>
                      <p className="font-mono-tabular text-lg font-bold text-[#123B57]">
                        {analysis.microredCount}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!analysis || publishing}
              onClick={handlePublish}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-[#25804A] hover:bg-[#1f6d3f] disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-[14px] py-3 px-4 rounded-xl transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{publishing ? 'Publicando en Firestore...' : 'Publicar en Plataforma'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {activeTab === 'usuarios' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80">
            <h2 className="font-display text-base font-bold text-[#123B57]">
              Personal Registrado y Permisos Nominales
            </h2>
          </div>
          {loadingSubTab ? (
            <div className="p-8 text-center text-sm text-slate-500">Cargando usuarios...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Correo</th>
                    <th className="px-4 py-3 font-semibold">Rol</th>
                    <th className="px-4 py-3 font-semibold">Acceso Nominal</th>
                    <th className="px-4 py-3 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersList.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-[#123B57]">{u.displayName}</td>
                      <td className="px-4 py-3 font-mono-tabular text-[12.5px] text-slate-600">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 capitalize">{u.role}</td>
                      <td className="px-4 py-3 font-semibold">
                        <span className={u.nominalAccess ? 'text-[#25804A]' : 'text-slate-500'}>
                          {u.nominalAccess ? 'Autorizado' : 'Restringido'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.role !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => handleToggleNominal(u)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-[12.5px] font-semibold text-[#123B72] cursor-pointer"
                          >
                            {u.nominalAccess ? 'Revocar nominal' : 'Autorizar nominal'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CARTILLA CMS */}
      {activeTab === 'cartilla' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateCartilla}
            className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-[#123B57]">
              Publicar nueva guía en Cartilla HIS
            </h2>
            <div>
              <label className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                Título de la guía
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ej. Criterio HIS para Dosaje de Creatinina"
                className="w-full px-3.5 py-2 text-[13.5px] border border-slate-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                  Categoría
                </label>
                <select
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value as CartillaTopic)}
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white"
                >
                  <option value="Códigos HIS">Códigos HIS</option>
                  <option value="Diagnósticos">Diagnósticos</option>
                  <option value="Procedimientos">Procedimientos</option>
                  <option value="Laboratorios">Laboratorios</option>
                  <option value="Criterios de registro">Criterios de registro</option>
                  <option value="Ejemplos de registros correctos">Ejemplos correctos</option>
                  <option value="Errores frecuentes">Errores frecuentes</option>
                  <option value="Recomendaciones de indicadores">Recomendaciones</option>
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                  Tipo de recurso
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as CartillaResourceType)}
                  className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white"
                >
                  <option value="Guía HIS">Guía HIS</option>
                  <option value="Documento PDF">Documento PDF</option>
                  <option value="Documento Word">Documento Word</option>
                  <option value="Video tutorial">Video tutorial</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                Códigos HIS (separados por coma)
              </label>
              <input
                type="text"
                value={newCodes}
                onChange={(e) => setNewCodes(e.target.value)}
                placeholder="Ej. C8002, 82565, Z000"
                className="w-full px-3.5 py-2 text-[13.5px] border border-slate-200 rounded-xl font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                Resumen breve
              </label>
              <input
                type="text"
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Descripción corta para la tarjeta"
                className="w-full px-3.5 py-2 text-[13.5px] border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                Contenido normativo
              </label>
              <textarea
                required
                rows={4}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Detalle completo de registro HIS, LAB y validaciones..."
                className="w-full px-3.5 py-2 text-[13.5px] border border-slate-200 rounded-xl"
              />
            </div>

            <button
              type="submit"
              disabled={savingCartilla}
              className="w-full bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13.5px] py-2.5 px-4 rounded-xl cursor-pointer"
            >
              {savingCartilla ? 'Guardando...' : 'Publicar en Cartilla HIS'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6">
            <h2 className="font-display text-base font-bold text-[#123B57] mb-4">
              Guías personalizadas publicadas ({cartillaList.length})
            </h2>
            {cartillaList.length === 0 ? (
              <p className="text-sm text-slate-500">
                Las guías normativas base ya están activas en Cartilla de Registro. Puede agregar
                lineamientos propios de la RIS San Ignacio usando el formulario.
              </p>
            ) : (
              <div className="space-y-3">
                {cartillaList.map((item) => (
                  <div
                    key={item.resourceId}
                    className="p-4 rounded-xl border border-slate-200/80 flex items-start justify-between gap-3"
                  >
                    <div>
                      <p className="text-[11.5px] font-semibold text-[#25804A]">{item.topic}</p>
                      <p className="font-bold text-[14px] text-[#123B72]">{item.title}</p>
                      <p className="text-[12.5px] text-slate-600 mt-1">{item.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCartilla(item.resourceId)}
                      aria-label="Eliminar guía"
                      className="p-2 rounded-lg text-slate-400 hover:text-[#C74747] hover:bg-[#C74747]/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: UPLOAD HISTORY */}
      {activeTab === 'historial' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80">
            <h2 className="font-display text-base font-bold text-[#123B57]">
              Auditoría de Cargas y Publicaciones
            </h2>
          </div>
          {loadingSubTab ? (
            <div className="p-8 text-center text-sm text-slate-500">Cargando historial...</div>
          ) : historyList.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No hay publicaciones registradas en Firestore todavía.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                    <th className="px-4 py-3 font-semibold">Módulo</th>
                    <th className="px-4 py-3 font-semibold">Archivo</th>
                    <th className="px-4 py-3 font-semibold text-right">Filas</th>
                    <th className="px-4 py-3 font-semibold text-right">Duplicados</th>
                    <th className="px-4 py-3 font-semibold">Publicado por</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyList.map((h) => (
                    <tr key={h.historyId}>
                      <td className="px-4 py-3 font-semibold capitalize text-[#123B72]">
                        {h.module}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{h.fileName}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{h.rowCount}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{h.duplicateCount}</td>
                      <td className="px-4 py-3 text-slate-600">{h.uploadedByName}</td>
                      <td className="px-4 py-3 font-semibold text-[#25804A]">{h.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
