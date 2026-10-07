import {
  Apple, ArrowLeftRight, Baby, Banknote, Bath, Beer, Bike, BookOpen, Briefcase, Building2, Bus, Cake, Calendar, Car,
  ChartLine, CircleEllipsis, Clapperboard, Coffee, Coins, CreditCard, Droplets, Dumbbell, FileText, Flame, Fuel,
  Gamepad2, Gem, Gift, Globe, GraduationCap, Hammer, HandCoins, HandHeart, HeartPulse, House, Laptop, Leaf, Luggage,
  Landmark, Music, Package, PawPrint, Percent, PiggyBank, Pill, Pizza, Plane, Receipt, Repeat, Scissors, Shield, Shirt,
  ShoppingBag, ShoppingBasket, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag, Target, Ticket, TrainFront,
  TrendingUp, Trophy, Tv, Users, Utensils, Wallet, Wifi, Wine, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

/** Curated icon set for categories, accounts, assets and the like. Keys are stored in the database. */
export const ICONS = {
  utensils: Utensils,
  coffee: Coffee,
  pizza: Pizza,
  beer: Beer,
  wine: Wine,
  cake: Cake,
  apple: Apple,
  'shopping-basket': ShoppingBasket,
  'shopping-bag': ShoppingBag,
  store: Store,
  shirt: Shirt,
  sparkles: Sparkles,
  scissors: Scissors,
  car: Car,
  bus: Bus,
  train: TrainFront,
  bike: Bike,
  plane: Plane,
  fuel: Fuel,
  luggage: Luggage,
  globe: Globe,
  house: House,
  building: Building2,
  sofa: Sofa,
  wrench: Wrench,
  hammer: Hammer,
  receipt: Receipt,
  zap: Zap,
  droplets: Droplets,
  flame: Flame,
  wifi: Wifi,
  smartphone: Smartphone,
  tv: Tv,
  laptop: Laptop,
  clapperboard: Clapperboard,
  ticket: Ticket,
  music: Music,
  gamepad: Gamepad2,
  'heart-pulse': HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  dumbbell: Dumbbell,
  bath: Bath,
  'graduation-cap': GraduationCap,
  books: BookOpen,
  baby: Baby,
  'paw-print': PawPrint,
  users: Users,
  gift: Gift,
  'hand-heart': HandHeart,
  leaf: Leaf,
  briefcase: Briefcase,
  percent: Percent,
  'trending-up': TrendingUp,
  chart: ChartLine,
  banknote: Banknote,
  coins: Coins,
  'hand-coins': HandCoins,
  landmark: Landmark,
  'credit-card': CreditCard,
  wallet: Wallet,
  'piggy-bank': PiggyBank,
  gem: Gem,
  'file-text': FileText,
  shield: Shield,
  package: Package,
  repeat: Repeat,
  calendar: Calendar,
  target: Target,
  trophy: Trophy,
  tag: Tag,
  transfer: ArrowLeftRight,
  'circle-ellipsis': CircleEllipsis,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;
export const ICON_KEYS = Object.keys(ICONS) as IconKey[];
export const FALLBACK_ICON: IconKey = 'circle-ellipsis';

/** Apple system colours used for identity (categories, accounts, assets). Same in both themes. */
export const PALETTE = {
  red: '#ff453a',
  orange: '#ff9f0a',
  yellow: '#ffcc00',
  green: '#30d158',
  mint: '#00c7be',
  teal: '#30b0c7',
  cyan: '#32ade6',
  blue: '#0a84ff',
  indigo: '#5e5ce6',
  purple: '#bf5af2',
  pink: '#ff375f',
  brown: '#a2845e',
  gray: '#8e8e93',
} as const;
export type PaletteName = keyof typeof PALETTE;
export const PALETTE_COLORS: string[] = Object.values(PALETTE);

/** Emoji used by earlier versions, mapped to icon keys. */
export const EMOJI_ICONS: Record<string, IconKey> = {
  '\u{1f354}': 'utensils', '\u{1f355}': 'pizza', '\u{1f35c}': 'utensils', '\u{1f37d}': 'utensils', '\u{1f958}': 'utensils', '\u{1f35b}': 'utensils',
  '\u{2615}': 'coffee', '\u{1f375}': 'coffee', '\u{1f37a}': 'beer', '\u{1f377}': 'wine', '\u{1f382}': 'cake', '\u{1f34e}': 'apple',
  '\u{1f6d2}': 'shopping-basket', '\u{1f6cd}': 'shopping-bag', '\u{1f455}': 'shirt', '\u{1f457}': 'shirt', '\u{1f484}': 'sparkles', '\u{1f487}': 'scissors',
  '\u{1f695}': 'car', '\u{1f697}': 'car', '\u{1f68c}': 'bus', '\u{1f686}': 'train', '\u{1f6b2}': 'bike', '\u{1f3cd}': 'bike', '\u{2708}': 'plane', '\u{26fd}': 'fuel', '\u{1f9f3}': 'luggage',
  '\u{1f3e0}': 'house', '\u{1f3e1}': 'house', '\u{1f3e2}': 'building', '\u{1f6cb}': 'sofa', '\u{1f527}': 'wrench', '\u{1f528}': 'hammer',
  '\u{1f4a1}': 'zap', '\u{26a1}': 'zap', '\u{1f4a7}': 'droplets', '\u{1f525}': 'flame', '\u{1f4f6}': 'wifi', '\u{1f4f1}': 'smartphone', '\u{1f4fa}': 'tv', '\u{1f4bb}': 'laptop',
  '\u{1f3ac}': 'clapperboard', '\u{1f39f}': 'ticket', '\u{1f3b5}': 'music', '\u{1f3ae}': 'gamepad',
  '\u{1f48a}': 'pill', '\u{1f3e5}': 'heart-pulse', '\u{1fa7a}': 'stethoscope', '\u{1f3cb}': 'dumbbell', '\u{1f4aa}': 'dumbbell',
  '\u{1f4da}': 'graduation-cap', '\u{1f393}': 'graduation-cap', '\u{1f4d6}': 'books', '\u{1f476}': 'baby', '\u{1f436}': 'paw-print', '\u{1f431}': 'paw-print',
  '\u{1f381}': 'gift', '\u{2764}': 'hand-heart', '\u{1f64f}': 'hand-heart', '\u{1f331}': 'leaf',
  '\u{1f4bc}': 'briefcase', '\u{1f3e6}': 'landmark', '\u{1f4b0}': 'banknote', '\u{1f4b5}': 'banknote', '\u{1fa99}': 'coins', '\u{1f4c8}': 'trending-up',
  '\u{1f4b3}': 'credit-card', '\u{1f45b}': 'wallet', '\u{1f437}': 'piggy-bank', '\u{1f48e}': 'gem', '\u{1f9fe}': 'receipt', '\u{1f4c4}': 'file-text',
  '\u{1f6e1}': 'shield', '\u{1f4e6}': 'circle-ellipsis', '\u{1f4c5}': 'calendar', '\u{1f3af}': 'target', '\u{1f3c6}': 'trophy', '\u{1f501}': 'repeat', '\u{21c4}': 'transfer',
};

const isKey = (s: string): s is IconKey => Object.prototype.hasOwnProperty.call(ICONS, s);

/** Resolves a stored icon (a key, or a legacy emoji) to an icon key. Unknown values fall back to circle-ellipsis. */
export function iconKey(value?: string | null): IconKey {
  if (!value) return FALLBACK_ICON;
  if (isKey(value)) return value;
  const bare = value.replace(/[️‍]/g, '').trim();
  return EMOJI_ICONS[bare] ?? EMOJI_ICONS[[...bare][0] ?? ''] ?? FALLBACK_ICON;
}
export const iconFor = (value?: string | null): LucideIcon => ICONS[iconKey(value)];

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Nearest identity-palette colour ("redmean" distance, which tracks perception better than plain RGB). */
export function nearestPalette(hex?: string): string {
  const a = hex ? rgb(hex) : null;
  if (!a) return PALETTE.gray;
  let best: string = PALETTE.gray;
  let bestD = Infinity;
  for (const c of PALETTE_COLORS) {
    const b = rgb(c)!;
    const r = (a[0] + b[0]) / 2;
    const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const d = (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db;
    if (d < bestD) (bestD = d, best = c);
  }
  return best;
}

/** Glyph colour that reads on a solid tile of `bg`: dark on light colours (yellow, mint, cyan), white otherwise. */
const DARK_GLYPH = new Set<string>([PALETTE.yellow, PALETTE.mint, PALETTE.cyan]);
export function glyphOn(bg?: string): string {
  if (bg && DARK_GLYPH.has(bg.toLowerCase())) return '#1c1c1e';
  const c = bg ? rgb(bg) : null;
  if (!c) return '#ffffff';
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? '#1c1c1e' : '#ffffff';
}

/** Icon keys for account kinds. */
export const ACCOUNT_ICONS: Record<string, IconKey> = { bank: 'landmark', cash: 'banknote', card: 'credit-card', wallet: 'wallet' };
