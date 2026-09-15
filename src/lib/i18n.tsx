import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'tr' | 'en';

const STORAGE_KEY = 'windfoil.lang.v1';

/**
 * The Turkish string is the key.
 *
 * It keeps components readable (you see the real sentence, not `booking.title`)
 * and halves the dictionary, since only the English side needs listing. The
 * trade-off: editing a Turkish string in a component silently drops it back to
 * Turkish in English mode until the key here is updated too.
 */
const EN: Record<string, string> = {
  // header and shell
  'Yerel eğitmenlerle windsurf & wingfoil dersleri':
    'Windsurf & wingfoil lessons with local instructors',
  'Giriş yap': 'Sign in',
  Yönetim: 'Admin',
  Yönetici: 'Admin',
  Eğitmen: 'Instructor',
  Öğrenci: 'Student',
  Müşteri: 'Customer',
  Profil: 'Profile',
  'Şifre değiştir': 'Change password',
  'Çıkış yap': 'Sign out',
  Giriş: 'Sign in',

  // day navigation
  Bugün: 'Today',
  Yarın: 'Tomorrow',
  Dün: 'Yesterday',
  'Bugüne dön': 'Jump to today',
  'Gün seçin': 'Choose a day',
  'Önceki gün': 'Previous day',
  'Sonraki gün': 'Next day',

  // calendar
  Tümü: 'All',
  'Spora göre filtrele': 'Filter by sport',
  'Müsait saatler': 'Available hours',
  Takvimim: 'My calendar',
  '08:00 – 20:00 arası ders alınabilir': 'Lessons run between 08:00 and 20:00',
  Müsait: 'Free',
  'Müsait · düzenle': 'Free · edit',
  Beklemede: 'Pending',
  Dolu: 'Booked',
  Kapalı: 'Closed',
  Bloke: 'Blocked',
  Geçmiş: 'Past',
  Talebiniz: 'Your request',
  '✓ Rezerve': '✓ Booked',
  'Kapalı · Aç': 'Closed · open',
  'Açık · Kapat': 'Open · close',
  'Bu filtreye uyan eğitmen yok': 'No instructor matches this filter',
  '“Tümü”nü deneyin.': 'Try “All”.',
  'Takvime ulaşılamadı': 'Could not reach the calendar',
  'Tekrar dene': 'Try again',
  'Hesabınız eğitmen olarak işaretli ama henüz bir hocaya bağlanmamış. Yöneticinin sizi eşleştirmesi gerekiyor.':
    'Your account is marked as an instructor but is not linked to an instructor profile yet. An admin needs to connect them.',
  'Bir saate tıklayarak kapatabilir, kapalı bir saate tıklayarak yeniden açabilirsiniz.':
    'Click an hour to close it, or a closed hour to open it again.',
  'Yönetici olarak herhangi bir hocanın saatine tıklayıp kapatabilir, kapalı bir saate tıklayıp açabilirsiniz.':
    'As an admin you can click any instructor’s hour to close it, or a closed hour to open it.',
  'Müsaitlik ayrı bir tabloda tutulmaz — bir saat yalnızca rezervasyon varsa ya da eğitmen kapattıysa dolu görünür.':
    'Availability is not stored anywhere — an hour is only unavailable because a booking exists or the instructor closed it.',

  // hour actions
  'Bu saatte ne yapmak istiyorsunuz?': 'What would you like to do with this hour?',
  'Ders oluştur': 'Create lesson',
  'Çocuk kampı': 'Kids camp',
  'Bloke et': 'Block',
  'Bloğu kaldır': 'Remove block',
  'Bloke edilen saat müsait görünmez ve kimse ders alamaz.':
    'A blocked hour is hidden from the schedule and cannot be booked.',
  Kapat: 'Close',

  // booking
  'Ders talebi': 'Lesson request',
  'Ayırtmak için giriş yapın': 'Sign in to book',
  'Önce profilinizi tamamlayın': 'Complete your profile first',
  'Kimin adına?': 'Who is it for?',
  '— kullanıcı seçin —': '— choose a user —',
  'Ders tipi': 'Lesson type',
  Bireysel: 'Individual',
  Grup: 'Group',
  'Kaç kişi?': 'How many people?',
  'En fazla 4 kişi.': 'Four people maximum.',
  'Hangi ders?': 'Which sport?',
  Süre: 'Duration',
  Vazgeç: 'Cancel',
  Kaydet: 'Save',
  'Kaydediliyor…': 'Saving…',
  'Talep gönder': 'Send request',
  'Spor seçin': 'Choose a sport',
  'Süre seçin': 'Choose a duration',
  'Kişi sayısı': 'Group size',
  'Eğitmenin size ulaşabilmesi için telefon numaranıza ihtiyacımız var.':
    'We need your phone number so the instructor can reach you.',
  'Profili tamamla': 'Complete profile',
  'Personelin girdiği ders doğrudan onaylı kaydedilir.':
    'A lesson entered by staff is saved as approved.',
  'Talebiniz eğitmen onayına gider. Onaya kadar bu saatler size kilitli kalır.':
    'Your request goes to the instructor for approval. The hours stay held for you until then.',

  // profile
  'Profilini tamamla': 'Complete your profile',
  'Profilini düzenle': 'Edit your profile',
  'Rezervasyon yapabilmek için telefon numaranız gerekiyor — eğitmenin size ulaşabilmesi için.':
    'We need your phone number before you can book — so the instructor can reach you.',
  'İsim soyisim': 'Full name',
  'Telefon numarası': 'Phone number',
  'En az 10 rakam girin.': 'Enter at least 10 digits.',
  'İlgi alanınız': 'What are you interested in',
  'Ekipman kiralama': 'Equipment rental',
  'Wingfoil dersi': 'Wingfoil lesson',
  'Windsurf dersi': 'Windsurf lesson',
  Sonra: 'Later',

  // my bookings
  Derslerim: 'My lessons',
  'Henüz bir dersiniz yok. Yukarıdan bir gün seçip müsait bir saate tıklayın.':
    'No lessons yet. Pick a day above and click a free hour.',
  Onaylandı: 'Approved',
  Reddedildi: 'Rejected',
  Onaylı: 'Approved',
  İptal: 'Cancel',

  // requests
  'Bekleyen talepler': 'Pending requests',
  'Bekleyen talep yok.': 'No pending requests.',
  Onayla: 'Approve',
  Reddet: 'Reject',
  İlgi: 'Interests',
  Kiralama: 'Rental',
  saat: 'h',

  // admin
  'Ana Sayfa': 'Dashboard',
  Kullanıcılar: 'Users',
  Rezervasyonlar: 'Bookings',
  'Takvime dön': 'Back to calendar',
  'Yönetim menüsü': 'Admin menu',
  'Toplam Kullanıcı': 'Total users',
  'Toplam Hoca': 'Instructors',
  'Toplam Öğrenci': 'Students',
  'Toplam Rezervasyon': 'Total bookings',
  'Bu Ay Verilen Ders': 'Lessons this month',
  'Öğrenci sayısı, rolü eğitmen ya da yönetici olmayan kullanıcıları sayar. Bu ay verilen ders, bu ay başlayan onaylı rezervasyonların toplam saatidir.':
    'Students counts users who are neither instructors nor admins. Lessons this month is the total hours of approved bookings starting this month.',
  'Hoca Ekle': 'Add instructor',
  'Role göre filtrele': 'Filter by role',
  'İsim veya e-posta ara': 'Search name or email',
  Ara: 'Search',
  'Yükleniyor…': 'Loading…',
  'Bu filtreye uyan kullanıcı yok.': 'No user matches this filter.',
  İsim: 'Name',
  'E-posta': 'Email',
  Telefon: 'Phone',
  Rol: 'Role',
  Kayıt: 'Joined',
  'Hoca profili': 'Instructor profile',
  '— seçin —': '— choose —',
  'Duruma göre filtrele': 'Filter by status',
  'Tüm hocalar': 'All instructors',
  Hoca: 'Instructor',
  Başlangıç: 'From',
  Bitiş: 'To',
  'İsim veya rezervasyon ID ara': 'Search name or booking ID',
  'Bu filtreye uyan rezervasyon yok.': 'No booking matches this filter.',
  Ders: 'Lesson',
  'Mevcut dersler sayılamadı': 'Could not count existing lessons',
  'Bu saatten sonra {n} saat müsait.': 'Only {n} more hour(s) free after this.',
  'Tarih / saat': 'Date / time',
  Durum: 'Status',

  // add instructor
  'Hoca ekle': 'Add instructor',
  'Hocanın kayıt olmasını beklemeden profil oluşturabilirsiniz; takvimde hemen görünür. Kayıt olup e-postasını doğruladığında hesabı bu profile otomatik bağlanır.':
    'You can create the profile before they sign up; it appears on the calendar immediately. When they register and verify that email, their account links to this profile automatically.',
  'E-posta (eşleştirme anahtarı)': 'Email (the matching key)',
  'Geçerli bir e-posta girin.': 'Enter a valid email address.',
  'Uzmanlık alanı': 'Specialities',
  'Telefon (opsiyonel)': 'Phone (optional)',
  'Kısa tanıtım (opsiyonel)': 'Short bio (optional)',

  // password
  'Mevcut şifre': 'Current password',
  'Yeni şifre': 'New password',
  'En az 8 karakter.': 'At least 8 characters.',
  'Şifreniz değiştirildi.': 'Your password has been changed.',

  // errors surfaced from the data layer
  'Eğitmenler yüklenemedi': 'Could not load instructors',
  'Dolu saatler yüklenemedi': 'Could not load busy hours',
  'Kapalı saatler yüklenemedi': 'Could not load blocked hours',
  'Rezervasyonlarınız yüklenemedi': 'Could not load your bookings',
  'Rezervasyon oluşturulamadı': 'Could not create the booking',
  'Bu saatler az önce doldu. Lütfen başka bir saat seçin.':
    'Those hours were just taken. Please pick another time.',
  'Rezervasyon için önce profilinizi tamamlamanız gerekiyor.':
    'Complete your profile before booking.',
  'Rezervasyon iptal edilemedi': 'Could not cancel the booking',
  'Saat kapatılamadı': 'Could not close the hour',
  'Saat açılamadı': 'Could not open the hour',
  'Ders listesi yüklenemedi': 'Could not load the lesson list',
  'Talepler yüklenemedi': 'Could not load requests',
  'Karar kaydedilemedi': 'Could not save the decision',
  'Profil okunamadı': 'Could not read the profile',
  'Profil kaydedilemedi': 'Could not save the profile',
  'Rolünüz okunamadı': 'Could not read your role',
  'Kullanıcılar yüklenemedi': 'Could not load users',
  'Rol güncellenemedi': 'Could not update the role',
  'Sayım yapılamadı': 'Could not count',
  'Rezervasyonlar yüklenemedi': 'Could not load bookings',
  'Eğitmen eklenemedi': 'Could not add the instructor',
  'Bu e-posta ile kayıtlı bir eğitmen zaten var.':
    'An instructor with that email already exists.',
  'Aylık ders saati hesaplanamadı': 'Could not total this month’s hours',
};

/**
 * Module-level copy of the current language.
 *
 * The data layer raises user-facing messages and cannot call a React hook, so it
 * reads this instead. The provider keeps it in step.
 */
let current: Lang = 'tr';

export function getLang(): Lang {
  return current;
}

export function translate(text: string, lang: Lang = current): string {
  if (lang === 'tr') return text;
  return EN[text] ?? text;
}

/** Date and number formatting follows the chosen language. */
export function locale(lang: Lang = current): string {
  return lang === 'tr' ? 'tr-TR' : 'en-GB';
}

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'tr' ? v : 'tr';
  } catch {
    return 'tr';
  }
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (text: string) => string };

const LangContext = createContext<Ctx>({ lang: 'tr', setLang: () => {}, t: (s) => s });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = readStored();
    current = l;
    return l;
  });

  useEffect(() => {
    current = lang;
    document.documentElement.lang = lang;
    document.title = lang === 'tr' ? 'Sun Surf Alaçatı — ders ayırt' : 'Sun Surf Alaçatı — book a lesson';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* a per-browser convenience; fine if storage is unavailable */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    // Set the module copy in the same tick as the state change: the data layer
    // and the date helpers read it during the very next render, before the
    // effect below has run.
    current = l;
    setLangState(l);
  }, []);
  const t = useCallback((text: string) => translate(text, lang), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  return useContext(LangContext);
}
