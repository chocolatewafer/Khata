/**
 * Banks and wallets people link as accounts.
 * `match` is tested against the message text and only uses full names or distinctive words, so it
 * doesn't fire on ordinary English. `sender` is tested against the SMS sender ID with separators
 * removed ("VM-HDFCBK" → "VMHDFCBK"), where banks use short codes.
 */
export interface Provider {
  id: string;
  name: string;
  country: 'NP' | 'IN';
  kind: 'bank' | 'wallet';
  color: string;
  match: RegExp;
  sender: RegExp;
  note?: string;
}

const p = (id: string, name: string, country: Provider['country'], kind: Provider['kind'], color: string, match: RegExp, sender: RegExp, note?: string): Provider =>
  ({ id, name, country, kind, color, match, sender, note });

const UPI_NOTE = "UPI payments are confirmed by your bank's SMS, so link that bank too.";

export const PROVIDERS: Provider[] = [
  // Nepal: wallets
  p('esewa', 'eSewa', 'NP', 'wallet', '#41a124', /\besewa\b/i, /ESEWA/),
  p('khalti', 'Khalti', 'NP', 'wallet', '#5c2d91', /\bkhalti\b/i, /KHALTI/),
  p('imepay', 'IME Pay', 'NP', 'wallet', '#d6202a', /\bime\s?pay\b/i, /IMEPAY/),
  p('mypay', 'MyPay', 'NP', 'wallet', '#1d6fb8', /\bmypay\b/i, /MYPAY/),
  // Nepal: banks
  p('nabil', 'Nabil Bank', 'NP', 'bank', '#0b4f9c', /\bnabil\b/i, /NABIL/),
  p('nicasia', 'NIC Asia Bank', 'NP', 'bank', '#e5262c', /\bnic\s?asia\b/i, /NICASIA|NICA/),
  p('gibl', 'Global IME Bank', 'NP', 'bank', '#1b3f8b', /\bglobal\s?ime\b/i, /GLOBALIME|GIBL/),
  p('nimb', 'Nepal Investment Mega Bank', 'NP', 'bank', '#00539b', /investment mega|\bnimb\b/i, /NIMB/),
  p('hbl', 'Himalayan Bank', 'NP', 'bank', '#c8102e', /\bhimalayan bank\b/i, /HIMALAYAN|HBLNEP/),
  p('ebl', 'Everest Bank', 'NP', 'bank', '#e4002b', /\beverest bank\b/i, /EVEREST/),
  p('kumari', 'Kumari Bank', 'NP', 'bank', '#ab1f2d', /\bkumari bank\b/i, /KUMARI/),
  p('prabhu', 'Prabhu Bank', 'NP', 'bank', '#d71920', /\bprabhu bank\b/i, /PRABHU/),
  p('sanima', 'Sanima Bank', 'NP', 'bank', '#00703c', /\bsanima\b/i, /SANIMA/),
  p('siddhartha', 'Siddhartha Bank', 'NP', 'bank', '#a6192e', /\bsiddhartha bank\b/i, /SIDDHARTHA/),
  p('laxmi', 'Laxmi Sunrise Bank', 'NP', 'bank', '#7a1f6e', /\blaxmi sunrise\b|\blaxmi bank\b/i, /LAXMI/),
  p('nmb', 'NMB Bank', 'NP', 'bank', '#f26522', /\bnmb bank\b/i, /NMB/),
  p('mbl', 'Machhapuchchhre Bank', 'NP', 'bank', '#0066b3', /machhapuchchhre/i, /MACHHAPUCHCHHRE|MBLNEP/),
  p('citizens', 'Citizens Bank', 'NP', 'bank', '#00529b', /\bcitizens bank\b/i, /CITIZENS|CTZN/),
  p('prime', 'Prime Commercial Bank', 'NP', 'bank', '#003b71', /\bprime commercial\b/i, /PRIMEBANK|PCBL/),
  p('rbb', 'Rastriya Banijya Bank', 'NP', 'bank', '#00843d', /rastriya banijya/i, /RBB/),
  p('nbl', 'Nepal Bank', 'NP', 'bank', '#004b8d', /\bnepal bank\b/i, /NEPALBANK|NBLNEP/),
  p('adbl', 'Agricultural Development Bank', 'NP', 'bank', '#007a33', /agricultural development bank/i, /ADBL/),
  p('scbnl', 'Standard Chartered Nepal', 'NP', 'bank', '#0473ea', /standard chartered/i, /SCBNL|STANCHART/),
  p('nsbi', 'Nepal SBI Bank', 'NP', 'bank', '#22409a', /nepal sbi/i, /NSBI/),
  // India: wallets / UPI apps
  p('paytm', 'Paytm', 'IN', 'wallet', '#00baf2', /\bpaytm (?:wallet|payments bank)\b/i, /PAYTM/),
  p('phonepe', 'PhonePe', 'IN', 'wallet', '#5f259f', /\bphonepe wallet\b/i, /PHONPE|PHONEPE/, UPI_NOTE),
  p('gpay', 'Google Pay', 'IN', 'wallet', '#1a73e8', /\bgoogle pay\b/i, /GOOGLEPAY|GPAY/, UPI_NOTE),
  p('amazonpay', 'Amazon Pay', 'IN', 'wallet', '#ff9900', /\bamazon pay (?:balance|wallet)\b/i, /AMZNPY|AMAZONPAY/),
  p('mobikwik', 'MobiKwik', 'IN', 'wallet', '#0f6cbd', /\bmobikwik\b/i, /MOBIKW/),
  // India: banks
  p('sbi', 'State Bank of India', 'IN', 'bank', '#22409a', /\bstate bank of india\b|-\s?sbi\b|\bsbi (?:a\/c|card|upi)\b/i, /SBIINB|SBIPSG|SBIUPI|ATMSBI|CBSSBI/),
  p('hdfc', 'HDFC Bank', 'IN', 'bank', '#004c8f', /\bhdfc bank\b/i, /HDFCBK|HDFCBN/),
  p('icici', 'ICICI Bank', 'IN', 'bank', '#ae282e', /\bicici bank\b/i, /ICICIB|ICICIT/),
  p('axis', 'Axis Bank', 'IN', 'bank', '#97144d', /\baxis bank\b/i, /AXISBK|AXISB/),
  p('kotak', 'Kotak Mahindra Bank', 'IN', 'bank', '#ed1c24', /\bkotak\b/i, /KOTAKB|KOTAK/),
  p('pnb', 'Punjab National Bank', 'IN', 'bank', '#a6192e', /punjab national bank/i, /PNBSMS|PNBBNK/),
  p('bob', 'Bank of Baroda', 'IN', 'bank', '#f15a22', /bank of baroda/i, /BOBTXN|BOBSMS|BARODA/),
  p('canara', 'Canara Bank', 'IN', 'bank', '#0091d5', /\bcanara bank\b/i, /CANBNK|CANARA/),
  p('union', 'Union Bank of India', 'IN', 'bank', '#e31e24', /union bank of india/i, /UNIONB/),
  p('idfc', 'IDFC FIRST Bank', 'IN', 'bank', '#9c1d26', /\bidfc first\b/i, /IDFCFB|IDFC/),
  p('indusind', 'IndusInd Bank', 'IN', 'bank', '#98272a', /\bindusind\b/i, /INDUSB|INDUSIND/),
  p('yes', 'Yes Bank', 'IN', 'bank', '#0060aa', /\byes bank\b/i, /YESBNK|YESBANK/),
  p('federal', 'Federal Bank', 'IN', 'bank', '#f7a800', /\bfederal bank\b/i, /FEDBNK|FEDERAL/),
  p('au', 'AU Small Finance Bank', 'IN', 'bank', '#ec6608', /\bau small finance\b/i, /AUBANK/),
];

export const providerById = (id?: string) => PROVIDERS.find((x) => x.id === id);

/**
 * Sender ID wins; then text. In text, wallets come first because their messages also name the
 * funding bank. UPI handles ("someone@paytm") are ignored so a bank alert isn't tagged as the wallet.
 */
export function detectProvider(text: string, sender = '') {
  const compact = sender.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact) {
    const bySender = PROVIDERS.find((x) => x.sender.test(compact));
    if (bySender) return bySender.id;
  }
  const clean = text.replace(/\S+@\S+/g, ' ');
  return (PROVIDERS.find((x) => x.kind === 'wallet' && x.match.test(clean)) ?? PROVIDERS.find((x) => x.match.test(clean)))?.id;
}

export const monogram = (name: string) =>
  name.replace(/\b(bank|of|ltd|the)\b/gi, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || name[0];
