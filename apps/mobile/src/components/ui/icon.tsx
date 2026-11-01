import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

// Hold's icons: SF Symbols on iOS, Material Symbols on Android, one name for both. An icon never carries meaning
// alone; a word beside it, or an accessibility label on its control, does.
const ICONS = {
  scan: { ios: 'qrcode.viewfinder', android: 'qr_code_scanner' },
  paste: { ios: 'doc.on.clipboard', android: 'content_paste' },
  camera: { ios: 'camera', android: 'photo_camera' },
  shop: { ios: 'storefront', android: 'storefront' },
  rental: { ios: 'bag', android: 'shopping_bag' },
  info: { ios: 'info.circle', android: 'info' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  success: { ios: 'checkmark.circle', android: 'check_circle' },
  error: { ios: 'xmark.octagon', android: 'error' },
  forward: { ios: 'chevron.right', android: 'chevron_right' },
  ghost: { ios: 'square.on.square', android: 'layers' },
  ghostOff: { ios: 'square.on.square.dashed', android: 'layers_clear' },
  retake: { ios: 'arrow.counterclockwise', android: 'refresh' },
  today: { ios: 'calendar', android: 'today' },
  rentals: { ios: 'list.bullet.rectangle', android: 'receipt_long' },
  dropOffs: { ios: 'tray.and.arrow.down', android: 'inventory_2' },
  settings: { ios: 'gear', android: 'settings' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  mail: { ios: 'envelope', android: 'mail' },
  place: { ios: 'mappin.and.ellipse', android: 'location_on' },
  message: { ios: 'bubble.left.and.bubble.right', android: 'forum' },
  document: { ios: 'doc.text', android: 'description' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  trash: { ios: 'trash', android: 'delete' },
  clock: { ios: 'clock', android: 'schedule' },
  assistant: { ios: 'sparkles', android: 'auto_awesome' },
  shield: { ios: 'checkmark.shield', android: 'verified_user' },
  send: { ios: 'paperplane', android: 'send' },
  calendarPlus: { ios: 'calendar.badge.plus', android: 'event_upcoming' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  claim: { ios: 'doc.text.magnifyingglass', android: 'policy' },
  payment: { ios: 'creditcard', android: 'payments' },
  hold: { ios: 'lock.shield', android: 'lock' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  search: { ios: 'magnifyingglass', android: 'search' },
  mark: { ios: 'viewfinder', android: 'crop_free' },
  qr: { ios: 'qrcode', android: 'qr_code_2' },
  repair: { ios: 'wrench.and.screwdriver', android: 'build' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
  web: { ios: 'globe', android: 'language' },
  pending: { ios: 'circle.dashed', android: 'radio_button_unchecked' },
  upload: { ios: 'icloud.and.arrow.up', android: 'cloud_upload' },
  bell: { ios: 'bell', android: 'notifications' },
  bellOff: { ios: 'bell.slash', android: 'notifications_off' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, color, size = 22 }: { name: IconName; color: ColorValue; size?: number }) {
  // The web preview draws the Material glyph too.
  return <SymbolView name={{ ...ICONS[name], web: ICONS[name].android }} tintColor={color} size={size} aria-hidden />;
}

// For the native tab bar, which takes the names itself.
export const iconNames = (name: IconName) => ICONS[name];
