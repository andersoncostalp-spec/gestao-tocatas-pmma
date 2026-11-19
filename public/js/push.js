import { api } from './api.js';

export function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.warn('SW não registrado', e));
  }
}

export function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function base64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function statusPush() {
  if (!pushSuportado()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'ativo' : 'inativo';
}

export async function ativarPush() {
  if (!pushSuportado()) throw new Error('Este navegador não suporta notificações. No Android, use o Chrome e instale o app.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada. Libere nas configurações do navegador.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.get('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8(publicKey) });
  await api.post('/api/push/subscribe', sub.toJSON());
  return sub;
}

export async function desativarPush() {
  if (!pushSuportado()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}
