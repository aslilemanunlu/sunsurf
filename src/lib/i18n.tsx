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
  'Son {n} saat — iptal edilemez': 'Last {n} hours — cannot be cancelled',
  'Ders başlamasına 12 saatten az kaldı; iptal için eğitmeninizle görüşün.':
    'The lesson starts in less than 12 hours; talk to your instructor to cancel.',
  'Bu dersi iptal etmek istediğinize emin misiniz?': 'Cancel this lesson?',

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

  'İsim soyisim — yazın ya da listeden seçin': 'Full name — type it or pick from the list',
  'Kayıtlı müşteri': 'Existing customer',
  'Yeni kayıt açılacak': 'A new record will be created',
  'Hangi paketten düşsün?': 'Take it off which package?',
  'Pakete bağlama': 'Do not use a package',
  kaldı: 'left',
  'Paketler yüklenemedi': 'Could not load packages',

  'Çalışma dökümü': 'Worked hours',
  Ay: 'Month',
  'Bu ayda ders yok.': 'No lessons this month.',
  'Günleri göster': 'Show days',
  Gizle: 'Hide',
  'Seçili ay': 'Selected month',

  // repeating lessons and leave
  Tekrar: 'Repeat',
  'Tek sefer': 'Once',
  'Her gün': 'Every day',
  'Hafta içi': 'Weekdays',
  'Haftada bir': 'Weekly',
  'Kaç ders?': 'How many lessons?',
  'Dolu olan saatler atlanır; kaçının yazıldığı söylenir.':
    'Hours already taken are skipped; you are told how many were written.',
  '{a} ders yazıldı, {b} saat dolu olduğu için atlandı.':
    '{a} lessons written, {b} skipped because the hour was taken.',
  'İzin / gün kapat': 'Leave / close days',
  'İzin / gün kapatma': 'Leave and closed days',
  '{n} gün, 08:00 – 20:00 arası.': '{n} days, 08:00 to 20:00.',
  '{n} gün kapatıldı.': 'Closed {n} days.',
  '{n} gün yeniden açıldı.': 'Reopened {n} days.',
  'Bu aralıkta {n} ders var. Kapatmak onları silmez — ayrıca ilgilenmeniz gerekir.':
    'There are {n} lessons in this range. Closing it does not delete them — deal with those separately.',
  'Yeniden aç': 'Reopen',

  'Boş bırakabilirsiniz — kampı sonra isimlendirirsiniz.':
    'You can leave this empty — name the camp later.',

  'Bu saatteki ders bulunamadı; sayfayı yenileyip tekrar deneyin.':
    'Could not find the lesson in that hour; reload the page and try again.',

  '{n} bu hocanın uzmanlık alanlarında yazılı değil.':
    '{n} is not listed among this instructor’s specialities.',

  'Hocayı düzenle': 'Edit instructor',
  'Eğitmen kaydedilemedi': 'Could not save the instructor',
  'Hocanın kayıt olmasını beklemeden profil oluşturabilirsiniz; takvimde hemen görünür. Kayıt olduktan sonra hesabını aşağıdaki listeden bu profile bağlayın.':
    'You can create the profile before they sign up; it appears on the calendar at once. Once they register, link their account to this profile in the list below.',
  'Tüm müşteriler': 'All customers',
  'Telefon opsiyonel. Kaydet dediğinizde müşteri de oluşturulur.':
    'The phone is optional. Saving creates the customer too.',
  'Listeden seç': 'Pick from the list',
  'Bu sezonda çocuk kampı rezervasyonu yok.': 'No kids camp bookings in this season.',
  'Kaydet dedikten sonra bu pencere açık kalır ve formu ekleyebilirsiniz.':
    'This stays open after saving so you can add the form.',

  'Dersi düzenle': 'Edit lesson',
  'Ders kaydedilemedi': 'Could not save the lesson',
  'Çocuklar sezon kayıt listesinde tutulur; burada isim sorulmaz.':
    'Children are kept on the season registration list; no name is asked for here.',

  // accounts and access
  'Kullanıcı Ekle': 'Add user',
  'Davet et': 'Invite',
  'Davet edildi': 'Invited',
  'Daveti geri al': 'Withdraw invitation',
  '{n} daveti geri alınsın mı?': 'Withdraw the invitation for {n}?',
  'Yetkiye göre filtrele': 'Filter by access',
  'Bu filtreye uyan hesap yok.': 'No account matches this filter.',
  'Davet kaydedilemedi': 'Could not save the invitation',
  'Davet silinemedi': 'Could not withdraw the invitation',
  'Şifreyi siz belirlemiyorsunuz: davet ettiğiniz kişi bu e-posta ile kayıt olup kendi şifresini seçer, yetkisi ilk girişinde otomatik tanımlanır. Böylece kimse bir başkasının şifresini bilmek zorunda kalmaz.':
    'You do not set the password: the person you invite signs up with this address, chooses their own, and gets their access on first sign-in. Nobody has to know a colleague’s password.',
  'Yetkisi olmayan bir hesap yalnızca herkese açık takvimi okur. Şifresini unutan herkes giriş ekranından kendisi yenileyebilir.':
    'An account with no access can only read the public calendar. Anyone who forgets their password can reset it from the sign-in screen.',

  // camp registrations
  'Sezon kayıtları': 'Season registrations',
  Sezon: 'Season',
  'Kamp Kaydı Ekle': 'Add registration',
  'Kamp kaydı': 'Registration',
  'Bu sezonda kayıtlı çocuk yok.': 'No children registered for this season.',
  Çocuk: 'Child',
  'Çocuğun adı soyadı': 'Child’s full name',
  'Veli adı soyadı': 'Guardian’s full name',
  'Veli ile aynı': 'Same as guardian',
  Form: 'Form',
  Yok: 'None',
  'Formun fotoğrafını ekle': 'Add a photo of the form',
  'Henüz form eklenmemiş.': 'No form added yet.',
  'Kaydı oluşturduktan sonra formun fotoğrafını ekleyin.':
    'Save the registration first, then add a photo of the form.',
  'Bu form silinsin mi?': 'Delete this form?',
  'Bu çocuk bu sezona zaten kayıtlı.': 'This child is already registered for this season.',
  'Kamp kayıtları yüklenemedi': 'Could not load registrations',
  'Kamp kaydı oluşturulamadı': 'Could not create the registration',
  'Kamp kaydı silinemedi': 'Could not delete the registration',
  'Form yüklenemedi': 'Could not load the form',
  'Form eklenemedi': 'Could not add the form',
  'Form silinemedi': 'Could not delete the form',
  'Görsel çok büyük. Daha küçük bir fotoğraf deneyin.':
    'That image is too large. Try a smaller photo.',

  // catalogue and roles
  'Özel ders': 'Private lesson',
  Depolama: 'Storage',
  Sigorta: 'Insurance',
  'Kids Camp': 'Kids camp',
  'Özel Ders Öğrencisi': 'Private lesson student',
  Kiralamacı: 'Rental customer',
  Depolamacı: 'Storage customer',
  'Ekipman seviyesi': 'Equipment level',
  Seans: 'Sessions',
  Kredi: 'Credit',
  Yıllık: 'Yearly',
  Yelken: 'Sail',
  'Board + Yelken': 'Board + sail',
  Adet: 'Count',
  Birim: 'Unit',
  seans: 'sessions',
  gün: 'days',
  kredi: 'credits',
  'Çalışma şekli': 'Engagement',
  Maaşlı: 'Salaried',
  Freelance: 'Freelance',
  'Nasıl çalışıyor?': 'How are they engaged?',
  Admin: 'Admin',
  'Yetki güncellenemedi': 'Could not update access',

  // customer record
  'Doğum tarihi': 'Date of birth',
  'Nereden geldi?': 'How did they find us?',
  'Instagram, otel, tavsiye…': 'Instagram, hotel, word of mouth…',
  'Neyle ilgileniyor?': 'What are they interested in?',
  'Sakatlık / dikkat edilmesi gereken': 'Injury / anything to watch for',
  'Suda bilinmesi gereken bir şey var mı?': 'Anything to know before they get on the water?',
  Sakatlık: 'Injury',
  Alerji: 'Allergy',
  Veli: 'Guardian',
  'Veli adı': 'Guardian name',
  'Veli telefonu': 'Guardian phone',
  'Acil durumda aranacak': 'Emergency contact',
  Dikkat: 'Watch for',
  Düzenle: 'Edit',
  'Müşteriyi düzenle': 'Edit customer',
  'Otel yönlendirmesi': 'Hotel referral',
  Tavsiye: 'Word of mouth',
  'Tekrar gelen': 'Returning',
  'Yoldan geçen': 'Walk-in',

  // payments
  Ödemeler: 'Payments',
  'Anlaşma Ekle': 'Add agreement',
  Tür: 'Type',
  Detay: 'Detail',
  'Türe göre filtrele': 'Filter by type',
  'Sadece borcu olanlar': 'Only with a balance',
  'Müşteri ara': 'Search customer',
  'Kayıtlı anlaşma yok.': 'No agreements yet.',
  'Kalan bakiye': 'Outstanding',
  'Tahsil edilen': 'Collected',
  Anlaşılan: 'Agreed',
  Ödenen: 'Paid',
  Kalan: 'Left',
  'Borçlu müşteri': 'Customers owing',
  'Bakiyeyi 0’la': 'Clear balance',
  'Anlaşılan tutar': 'Agreed amount',
  'Şimdi ödenen': 'Paid now',
  Tutar: 'Amount',
  'Ödemeyi kaydet': 'Save payment',
  'Kalanın tamamı': 'The whole balance',
  Geçmiş_ödeme: 'History',
  'Henüz ödeme yok.': 'No payments yet.',
  Silindi: 'Written off',
  Silinen: 'Written off',
  'gün geldi': 'days attended',
  'Çocuğun ismi': 'Child’s name',
  Açıklama: 'Description',
  'Detay yazın': 'Describe it',
  opsiyonel: 'optional',
  Not: 'Note',
  '“Diğer” seçtiniz; ne olduğunu yazın.': 'You chose “Other” — say what it is.',
  'Ödenen tutar anlaşılan tutardan büyük olamaz.':
    'The amount paid cannot exceed the amount agreed.',
  '{n} kalan bakiye sıfırlansın mı? Bu tutar tahsilat olarak sayılmaz.':
    'Clear the remaining {n}? It will not count as money collected.',
  'Bu anlaşma ve ödemeleri silinsin mi?': 'Delete this agreement and its payments?',
  'Bu ödeme kaydı silinsin mi?': 'Delete this payment?',
  'Bakiyeyi sıfırlamak, kalan tutarı silindi olarak kaydeder — tahsil edilen toplamına eklenmez.':
    'Clearing a balance records the remainder as written off — it is not added to the money collected.',
  'Ödemeler yüklenemedi': 'Could not load payments',
  'Anlaşma kaydedilemedi': 'Could not save the agreement',
  'Anlaşma silinemedi': 'Could not delete the agreement',
  'Ödeme kaydedilemedi': 'Could not save the payment',
  'Ödeme silinemedi': 'Could not delete the payment',
  'Tek ders': 'Single lesson',
  '5 ders paketi': '5-lesson pack',
  '10 ders paketi': '10-lesson pack',
  '20 ders paketi': '20-lesson pack',
  Diğer: 'Other',
  '1 saat': '1 hour',
  '2 saat': '2 hours',
  '3 saat': '3 hours',
  Haftalık: 'Weekly',
  Aylık: 'Monthly',
  Sezonluk: 'Seasonal',

  // staff-only model
  'Ders programı': 'Schedule',
  'Bu takvim görüntülemek içindir. Ders almak için bizimle iletişime geçin — rezervasyonu biz oluşturuyoruz.':
    'This calendar is here to read. To book a lesson, get in touch — we enter the booking for you.',
  'Bir saate tıklayarak ders yazabilir, çocuk kampı açabilir ya da saati bloke edebilirsiniz — her hocanın takviminde.':
    'Click any hour on any instructor’s calendar to write a lesson, open a kids camp, or block it.',
  'Kendi takviminizde bir saate tıklayarak ders yazabilir ya da saati bloke edebilirsiniz.':
    'Click an hour on your own calendar to write a lesson or block it.',
  'Ön rezervasyon': 'Tentative',
  'Ön rezervasyon (henüz kesin değil)': 'Tentative (not settled yet)',
  'Ön rezervasyon saati yine kapatır, ama takvimde beklemede görünür.':
    'A tentative booking still holds the hour, but shows as pending on the calendar.',
  'Dersi sil': 'Delete lesson',
  'Bu ders 12 saatten yakın. Yine de silinsin mi?':
    'This lesson starts in under 12 hours. Delete it anyway?',
  'Bu dersi silme yetkiniz yok.': 'You are not allowed to delete this lesson.',
  '— müşteri seçin —': '— choose a customer —',
  '+ Yeni müşteri': '+ New customer',
  'Yeni müşteri': 'New customer',
  'Müşteri Ekle': 'Add customer',
  'Müşteri eklenemedi': 'Could not add the customer',
  'Müşteri kaydedilemedi': 'Could not save the customer',
  'Müşteri silinemedi': 'Could not delete the customer',
  'Bu müşterinin dersleri var; önce onları silin.':
    'This customer has lessons on record; delete those first.',
  '{n} kaydı silinsin mi?': 'Delete {n}?',
  'Bu filtreye uyan müşteri yok.': 'No customer matches this filter.',
  'Segment değiştirmek için yönetici olmanız gerekiyor.':
    'Only an admin can change segments.',
  Kaydedildi: 'Saved',
  ders: 'lessons',
  son: 'last',
  'Hesaplar ve yetkiler': 'Accounts and access',
  'Yalnızca hocalar ve yöneticiler giriş yapar. Yeni bir hesap, siz yetki verene kadar hiçbir şey yapamaz — sadece takvimi okur.':
    'Only instructors and admins sign in. A new account can do nothing until you give it a role — it can only read the calendar.',
  'Kayıtlı hesap yok.': 'No accounts.',
  Yetki: 'Access',
  'Erişimi yok': 'No access',
  Doğrulanmadı: 'Not verified',
  'Toplam Müşteri': 'Total customers',
  Hesap: 'Accounts',
  'Hesap sayısı giriş yapabilen kişileri gösterir — müşterilerin hesabı yoktur. Bu ay verilen ders, bu ay başlayan onaylı rezervasyonların toplam saatidir.':
    'Accounts counts the people who can sign in — customers have none. Lessons this month is the total hours of approved bookings starting this month.',
  'Bekliyor demek, hoca profili var ama henüz bir hesaba bağlanmamış demektir. Hoca kayıt olduktan sonra aşağıdaki listeden hesabını bu profile bağlayın.':
    'Waiting means the instructor profile exists but no account is linked to it. Once they sign up, link their account to this profile in the list below.',

  // management and CRM
  Müşteriler: 'Customers',
  'Çocuk Kampı': 'Kids camp',
  Hocalar: 'Instructors',
  Segment: 'Segment',
  'Tüm segmentler': 'All segments',
  'Segmenti olmayan': 'No segment',
  'Ders alan': 'Lessons',
  Storage: 'Storage',
  'İsim, e-posta veya telefon ara': 'Search name, email or phone',
  İletişim: 'Contact',
  'Son ders': 'Last lesson',
  İsimsiz: 'No name',
  'Not var': 'Has notes',
  'Kendi beyanı': 'Their own answer',
  Notlar: 'Notes',
  'Bu müşteri hakkında bir not…': 'A note about this customer…',
  Ekle: 'Add',
  Sil: 'Delete',
  'Henüz not yok.': 'No notes yet.',
  'Notları yalnızca yöneticiler görür.': 'Only admins can see notes.',
  'Ders geçmişi': 'Lesson history',
  'Kayıtlı ders yok.': 'No lessons on record.',
  'Bu müşteri henüz profilini tamamlamadı; segment atanamaz.':
    'This customer has not completed their profile yet, so segments cannot be set.',
  'Kampa kayıtlı çocuklar': 'Children booked in',
  'Kamp kayıtları': 'Camp bookings',
  'Bu tarihlerde çocuk kampı kaydı yok.': 'No kids camp bookings in this range.',
  Tarihler: 'Dates',
  Gün: 'Days',
  Eklendi: 'Added',
  Bağlı: 'Linked',
  Bekliyor: 'Waiting',
  'Henüz hoca eklenmemiş.': 'No instructors yet.',
  'Bekliyor demek, hoca profili var ama henüz bir hesaba bağlanmamış demektir. Hoca bu e-posta ile kayıt olup adresini doğruladığında bağlantı kendiliğinden kurulur.':
    'Waiting means the instructor profile exists but no account is linked to it yet. The link is made automatically when they sign up with that email and verify it.',
  'Müşteri rezervasyonu açık': 'Customer booking is open',
  'Müşteri rezervasyonu kapalı': 'Customer booking is closed',
  'Müşteriler müsait saatlere talep gönderebilir.':
    'Customers can request any free hour.',
  'Takvim herkese görünür, ama müşteriler talep gönderemez. Hoca ve yönetici ders yazmaya devam edebilir.':
    'The schedule stays visible to everyone, but customers cannot send requests. Instructors and admins can still enter lessons.',
  'Rezervasyonu aç': 'Open booking',
  'Rezervasyonu kapat': 'Close booking',
  'Şu anda online rezervasyon kapalı. Takvimi görebilirsiniz; ders için bizimle iletişime geçin.':
    'Online booking is closed right now. You can still see the schedule — get in touch to arrange a lesson.',
  'Müşteri rezervasyonu kapalı. Siz ders yazmaya devam edebilirsiniz.':
    'Customer booking is closed. You can still enter lessons.',
  'Ayarlar okunamadı': 'Could not read the settings',
  'Ayar kaydedilemedi': 'Could not save the setting',
  'Müşteriler yüklenemedi': 'Could not load customers',
  'Segment kaydedilemedi': 'Could not save the segment',
  'Bu müşterinin henüz profili yok; segment atanamaz.':
    'This customer has no profile yet, so segments cannot be set.',
  'Notlar yüklenemedi': 'Could not load notes',
  'Not kaydedilemedi': 'Could not save the note',
  'Not silinemedi': 'Could not delete the note',
  'Çocuk kampı listesi yüklenemedi': 'Could not load the kids camp list',

  // reporting
  Raporlama: 'Reports',
  Dönem: 'Period',
  'Son 7 gün': 'Last 7 days',
  'Bu ay': 'This month',
  'Son 90 gün': 'Last 90 days',
  Özel: 'Custom',
  'Reddedilenleri de say': 'Include rejected',
  'Dönemdeki ders': 'Lessons in period',
  'Toplam saat': 'Total hours',
  'Toplam katılımcı': 'Total participants',
  'Onay bekleyen': 'Awaiting approval',
  'Hoca başına verilen saat': 'Hours taught per instructor',
  'Zaman içinde ders sayısı': 'Lessons over time',
  'Ders tipi dağılımı': 'Lesson type mix',
  'Talep durumu': 'Request status',
  'Bu dönemde ders yok.': 'No lessons in this period.',
  'Hoca bazında özet': 'Summary by instructor',
  Saat: 'Hours',

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
