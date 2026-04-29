const LABELS: Record<string, string> = {
  pending: 'pendiente',
  email_received: 'correo recibido',
  authenticity_high: 'autenticidad alta',
  match_found: 'coincidencia encontrada',
  preconfirmed: 'preconfirmado',
  requires_review: 'requiere revisión',
  needs_review: 'requiere revisión',
  rejected: 'rechazado',
  confirmed_manual: 'confirmado manualmente',
  active: 'activo',
  inactive: 'inactivo',
  revoked: 'revocado',
  expired: 'vencido',
  error: 'error',
  strong_match: 'coincidencia fuerte',
  possible_match: 'coincidencia posible',
  no_match: 'sin coincidencia',
  received: 'recibido',
  parsed: 'parseado',
  matched: 'coincide',
  ignored: 'ignorado',
  high: 'alto',
  medium: 'medio',
  low: 'bajo',
  unknown: 'desconocido',
  open: 'abierto',
  resolved: 'resuelto',
  escalated: 'escalado',
  email: 'correo',
  domain: 'dominio',
  none: 'ninguno',
  sender: 'remitente',
  reference: 'referencia',
  name: 'nombre',
  amount: 'monto',
  date: 'fecha',
  identity_required: 'referencia o nombre requeridos',
  duplicate: 'duplicado',
  provider_error: 'error del proveedor',
  authorized: 'autorizado',
  blocked: 'bloqueado',
  default: 'predeterminado',
  user: 'usuario',
  system: 'sistema',
  job: 'proceso',
  gmailaccount: 'cuenta de Gmail',
  gmailwatch: 'watch de Gmail',
  expectedtransfer: 'transferencia esperada',
  transfermatch: 'coincidencia',
  allowedbanksender: 'remitente bancario permitido',
  integration_api_token: 'token de integración',
  payment_provider_config: 'configuración de proveedor',
  payment_provider_verification_attempt: 'intento de proveedor',
  whatsappverificationattempt: 'intento de WhatsApp',
  transfer_created: 'transferencia creada',
  transfer_updated: 'transferencia actualizada',
  transfer_confirmed_manual: 'transferencia confirmada manualmente',
  transfer_rejected: 'transferencia rechazada',
  gmail_connected: 'Gmail conectado',
  gmail_manual_sync: 'sincronización manual de Gmail',
  gmail_deactivated: 'buzón de Gmail desactivado',
  gmail_reactivated: 'buzón de Gmail reactivado',
  gmail_watch_registered: 'watch de Gmail registrado',
  gmail_pubsub_pull: 'lectura de Pub/Sub de Gmail',
  match_generated: 'coincidencia generada',
  match_preconfirmed: 'coincidencia preconfirmada',
  match_reviewed: 'coincidencia revisada',
  match_rejected: 'coincidencia rechazada',
  allowed_sender_created: 'remitente permitido creado',
  allowed_sender_updated: 'remitente permitido actualizado',
  integration_token_created: 'token de integración creado',
  integration_token_revoked: 'token de integración revocado',
  payment_provider_config_created: 'configuración de proveedor creada',
  payment_provider_config_updated: 'configuración de proveedor actualizada',
  whatsapp_attempt_processed: 'intento de WhatsApp procesado',
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\./g, '_');
}

export function translateLabel(value?: string | null) {
  if (!value) {
    return 'Desconocido';
  }

  const key = normalizeKey(value);
  return LABELS[key] ?? value.replace(/_/g, ' ');
}

export function translateActorType(value?: string | null) {
  return translateLabel(value);
}

export function translateEntityType(value?: string | null) {
  return translateLabel(value);
}

export function translateAction(value?: string | null) {
  return translateLabel(value);
}

export function translateReasonCode(value?: string | null) {
  return translateLabel(value);
}
