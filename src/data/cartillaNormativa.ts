import { CartillaResource } from '../types';

export const BUILT_IN_CARTILLA_RESOURCES: CartillaResource[] = [
  {
    resourceId: 'guia_paquete_integral_adulto',
    title: 'Plan de Atención Integral de Salud del Adulto (30 a 59 años)',
    topic: 'Ejemplos de registros correctos',
    resourceType: 'Guía HIS',
    summary:
      'Codificación oficial HIS para inicio y culminación del Paquete de Atención Integral en población adulta de 30 a 59 años.',
    content:
      'Para contabilizar correctamente el indicador de Paquete de Atención Integral del Adulto (30–59 años), el profesional debe registrar el código C8002 cuando inicia o realiza seguimiento al plan y el código 99401 / 99386 según corresponda, consignando en el campo LAB el número de atención integral (1, 2 o TA al culminar el paquete anual). Verifique que los tamizajes obligatorios (valoración clínica de factores de riesgo, evaluación nutricional, salud mental y laboratorio básico) queden vinculados en la misma o sucesivas atenciones dentro del año calendario.',
    hisCodes: ['C8002', '99386', '99401', 'Z000'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
    examples: [
      { diagnostico: 'Examen médico general', tipo: 'D', lab: '1', codigo: 'Z000' },
      { diagnostico: 'Atención integral de salud del adulto', tipo: 'D', lab: '1', codigo: 'C8002' },
      { diagnostico: 'Consejería integral en estilos de vida', tipo: 'D', lab: '1', codigo: '99401.13' },
    ],
  },
  {
    resourceId: 'guia_tamizaje_ent_hta_dm',
    title: 'Tamizaje y Valoración Clínica de Hipertensión y Diabetes (ENT)',
    topic: 'Códigos HIS',
    resourceType: 'Guía HIS',
    summary:
      'Criterios de registro HIS para toma de presión arterial, perímetro abdominal, IMC y despistaje de enfermedades no transmisibles.',
    content:
      'Todo adulto de 30 a 59 años que acude por primera vez en el año debe recibir valoración clínica de factores de riesgo de Enfermedades No Transmisibles (ENT). Si el paciente presenta factores de riesgo (sobrepeso, obesidad, perímetro abdominal elevado o antecedente familiar), registre el código de tamizaje junto con el diagnóstico nutricional CIE-10 y el código de laboratorio de glucosa en ayunas (82947).',
    hisCodes: ['Z136', 'Z131', 'E660', 'E669', '82947', '99199.22'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
    examples: [
      { diagnostico: 'Examen de pesquisa especial para trastornos cardiovasculares', tipo: 'D', lab: '', codigo: 'Z136' },
      { diagnostico: 'Examen de pesquisa especial para diabetes mellitus', tipo: 'D', lab: '', codigo: 'Z131' },
      { diagnostico: 'Dosaje de glucosa en sangre', tipo: 'D', lab: 'N / A', codigo: '82947' },
    ],
  },
  {
    resourceId: 'guia_laboratorio_perfil_adulto',
    title: 'Registro de Laboratorios Básicos del Adulto (Glucosa, Colesterol, Triglicéridos)',
    topic: 'Laboratorios',
    resourceType: 'Guía HIS',
    summary:
      'Uso correcto de resultados en el campo LAB (Normal/Anormal) para exámenes bioquímicos y hematológicos del adulto.',
    content:
      'En los registros de laboratorio del Curso de Vida Adulto es obligatorio consignar en el campo LAB el resultado cualitativo cuando corresponda (N = Normal, A = Anormal) o el código de entrega de resultados. Un error frecuente detectado en control de calidad es dejar el campo LAB vacío en procedimientos 82947 (Glucosa), 82465 (Colesterol Total), 84478 (Triglicéridos) y 85018 (Hemoglobina), lo que invalida la trazabilidad del tamizaje.',
    hisCodes: ['82947', '82465', '84478', '83718', '85018'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
    examples: [
      { diagnostico: 'Dosaje de glucosa cuantitativo', tipo: 'D', lab: 'N', codigo: '82947' },
      { diagnostico: 'Dosaje de colesterol total', tipo: 'D', lab: 'A', codigo: '82465' },
      { diagnostico: 'Dosaje de triglicéridos', tipo: 'D', lab: 'N', codigo: '84478' },
    ],
  },
  {
    resourceId: 'guia_salud_mental_adulto',
    title: 'Tamizaje de Salud Mental, Violencia Familiar y Consumo de Alcohol',
    topic: 'Procedimientos',
    resourceType: 'Guía HIS',
    summary:
      'Secuencia correcta de códigos 96150.01 / 96150.02 / 96150.03 y registro de resultados positivos o negativos en LAB.',
    content:
      'El tamizaje de salud mental forma parte esencial del cuidado integral del adulto de 30 a 59 años. Se debe aplicar al menos un tamizaje anual de violencia intrafamiliar (96150.01), trastorno depresivo (96150.02) o consumo perjudicial de alcohol/drogas (96150.03). En el campo LAB se debe registrar el resultado: "-" para negativo o "+" para positivo; si es positivo, vincular inmediatamente la interconsulta o consejería psicológica correspondiente.',
    hisCodes: ['96150.01', '96150.02', '96150.03', 'Z133', '99402.09'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
    examples: [
      { diagnostico: 'Tamizaje en violencia familiar', tipo: 'D', lab: '-', codigo: '96150.01' },
      { diagnostico: 'Tamizaje en depresión', tipo: 'D', lab: '-', codigo: '96150.02' },
      { diagnostico: 'Tamizaje en consumo de alcohol y drogas', tipo: 'D', lab: '-', codigo: '96150.03' },
    ],
  },
  {
    resourceId: 'guia_tamizaje_cancer_adulto',
    title: 'Prevención y Tamizaje de Cáncer en Adultos (IVAA, PAP, VPH, Examen de Mama y PSA)',
    topic: 'Diagnósticos',
    resourceType: 'Guía HIS',
    summary:
      'Códigos CIE-10 y CPMS para detección temprana de cáncer de cuello uterino, mama y próstata en población de 30 a 59 años.',
    content:
      'Para mujeres de 30 a 49 años priorizar detección molecular de VPH (87621), IVAA (88141.01) o Papanicolaou (88141). En mujeres de 40 a 59 años registrar examen clínico de mama (99386 / Z123). En varones de 50 a 59 años registrar orientación y dosaje de PSA (84153) según disponibilidad del establecimiento o referencia a cabecera de microred.',
    hisCodes: ['Z124', 'Z123', 'Z125', '88141', '88141.01', '87621', '84153'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
    examples: [
      { diagnostico: 'Pesquisa de neoplasia maligna de cuello uterino', tipo: 'D', lab: 'N', codigo: 'Z124' },
      { diagnostico: 'Toma de muestra de Papanicolaou / IVAA', tipo: 'D', lab: 'N', codigo: '88141' },
      { diagnostico: 'Dosaje de antígeno prostático específico (PSA)', tipo: 'D', lab: 'N', codigo: '84153' },
    ],
  },
  {
    resourceId: 'guia_errores_frecuentes_his',
    title: 'Catálogo de Errores Frecuentes en Control de Calidad HIS (Adulto)',
    topic: 'Errores frecuentes',
    resourceType: 'Guía HIS',
    summary:
      'Principales causas de observación en las auditorías HIS de las 7 microredes de San Ignacio y cómo corregirlas antes del cierre mensual.',
    content:
      '1) Uso incorrecto del tipo de diagnóstico (TD): colocar "P" (Presuntivo) en procedimientos preventivos o tamizajes, cuando todo tamizaje y procedimiento ejecutado debe ser "D" (Definitivo). 2) Omitir el campo LAB en C8002 o en tamizajes de salud mental (96150.xx). 3) Registrar códigos pediátricos o del adolescente en pacientes entre 30 y 59 años. 4) Duplicidad de registros en la misma fecha y turno por doble digitación de ficha.',
    hisCodes: ['C8002', '96150.01', '99401', 'Z000'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
  },
  {
    resourceId: 'guia_criterios_generales_registro',
    title: 'Criterios Generales de Registro y Cierre Mensual en IPRESS',
    topic: 'Criterios de registro',
    resourceType: 'Guía HIS',
    summary:
      'Lineamientos operativos de la RIS San Ignacio para digitación oportuna, verificación de DNI/Historia Clínica y validación de tramas.',
    content:
      'Las IPRESS de las microredes San Ignacio, Chirinos, Huarango, La Coipa, Namballe, San José de Lourdes y Tamborapa deben validar semanalmente sus registros HIS antes de la consolidación quincenal. Todo registro debe consignar DNI válido (8 dígitos) o Carnet de Extranjería, edad exacta entre 30 y 59 años, sexo biológico consistente con el procedimiento (ej. PAP/IVAA solo femenino, PSA solo masculino) y UPS correcta.',
    hisCodes: ['Z000', 'C8002'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
  },
  {
    resourceId: 'guia_recomendaciones_indicadores',
    title: 'Recomendaciones para Alcanzar Metas de Indicadores de Desempeño 2026',
    topic: 'Recomendaciones de indicadores',
    resourceType: 'Guía HIS',
    summary:
      'Estrategias prácticas para mejorar la cobertura del Paquete Integral del Adulto y cierre de brechas en atenciones preventivas.',
    content:
      'Para optimizar los indicadores de desempeño en cada microred: a) Realizar búsqueda nominal mensual de adultos con paquete iniciado ("LAB 1") pero sin culminación ("LAB TA") en el módulo de Seguimiento por Pacientes. b) Integrar la toma de muestra de glucosa y lípidos en campañas extramurales y citas de control crónico. c) Verificar en el módulo de Control de Calidad que ningún registro quede observado por falta de LAB o incompatibilidad de edad.',
    hisCodes: ['C8002', '99401.13', '82947', '82465'],
    published: true,
    authorUid: 'normativa_minsa',
    isBuiltIn: true,
  },
];
