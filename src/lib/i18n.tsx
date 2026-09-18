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
  Müsait: 'Free',
  'Ders yaz': 'Book a lesson',
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

  '+ Hoca profili oluştur': '+ Create instructor profile',
  'İptal edilen': 'Cancelled',
  anlaşma: 'agreements',
  'Bu müşteriye bağlı {n} var; önce onları silin.':
    'This customer still has {n}; delete those first.',
  'Bu müşteri silinemiyor: başka bir kayda bağlı.':
    'This customer cannot be deleted: something else still refers to them.',

  'Ne yaptığı, yazdığınız dersten anlaşılıyor; ayrıca sormuyoruz.':
    'What they are here for comes from the lesson you are writing; we do not ask twice.',

  Misafir: 'Guest',
  'Misafir — kayıt açma': 'Guest — do not create a record',
  'Misafir derslerini dahil et': 'Include guest lessons',

  'Bu davet e-posta göndermez. Kişiye siz haber vereceksiniz: adresi kaydettikten sonra aşağıdaki mesajı kopyalayıp gönderin.':
    'This invitation sends no email. You tell them: save the address, then copy the message below and send it.',
  'Bu mesajı gönderin': 'Send them this',
  Kopyala: 'Copy',
  Kopyalandı: 'Copied',
  'Sun Surf Alaçatı sistemine eklendiniz.': 'You have been added to Sun Surf Alaçatı.',
  '“Giriş yap” → “Kayıt ol”': '“Sign in” → “Sign up”',
  'Şifrenizi kendiniz belirleyin.': 'Choose your own password.',
  'İlk girişinizde yetkiniz otomatik tanımlanacak.':
    'Your access is set up automatically on first sign-in.',

  'Excel’e aktar': 'Export to Excel',
  '{n} seçili': '{n} selected',
  'Seçimi temizle': 'Clear selection',
  'Tüm durumlar': 'All statuses',
  'Müşteri ve misafir': 'Customers and guests',
  'Tüm dersler': 'All sports',
  'Müşteri dersleri': 'Customer lessons',
  'Misafir dersleri': 'Guest lessons',
  Spor: 'Sport',
  Kim: 'Who',
  Tarih: 'Date',
  'E-posta ile gönder': 'Send by email',
  'Sun Surf Alaçatı — hesabınız hazır': 'Sun Surf Alaçatı — your account is ready',
  'Kendi e-posta programınız açılır; gönderen siz olursunuz.':
    'Your own mail app opens; the message comes from you.',

  '“{n}” adında bir müşteri zaten var. Yine de yeni bir kayıt açılsın mı?':
    'A customer called “{n}” already exists. Create a new record anyway?',
  İndir: 'Download',
  'Kaydedince eklenecek': 'Added when saved',
  'Önceki sezonlardan öğrenci': 'Student from a previous season',
  '— yeni öğrenci —': '— new student —',
  'Son formu açıldı; düzenleyip kaydettiğinizde {s} sezonu için yeni bir kayıt olur. Eski sezonun kaydı değişmez.':
    'Their latest form is loaded; saving creates a new registration for {s}. The earlier season is left unchanged.',
  'Kamp kaydı kaydedilemedi': 'Could not save the registration',

  'Yönetim yetkisi': 'Management access',
  'ders veriyorsa': 'if they teach',
  '— hoca değil —': '— not an instructor —',
  'Yönetim yetkisi ya da hoca profili seçin; ikisi de boşsa davetin bir anlamı yok.':
    'Choose management access or an instructor profile; with neither, the invitation grants nothing.',
  '{e} davet edildi. Şimdi haber verin:': '{e} is invited. Now let them know:',
  'WhatsApp ile paylaş': 'Share on WhatsApp',
  'Kendi uygulamanız açılır, mesaj hazır gelir; gönderen siz olursunuz.':
    'Your own app opens with the message ready; it is sent by you.',

  'Çalışılan gün': 'Days worked',

  'Bu hafta': 'This week',
  'Ders listesi': 'Lessons',
  'Bu tarihlerde ders yok.': 'No lessons in these dates.',

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
  'Segment değiştirmek için yönetici olmanız gerekiyor.': 'Only an admin can change segments.',
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
  'Toplam Çocuk': 'Camp children',
  'Bu Ay Kampa Gelen': 'At camp this month',
  çocuk: 'children',
  'Çocuk başına gün': 'Days per child',
  'Tam / yarım gün': 'Full and half days',
  'Bu dönemde kamp yoklaması yok.': 'No camp days recorded in this period.',
  'Toplam müşteri çocuk kampı kayıtlarını saymaz; kamp çocukları ayrı sayılır. Bu ay verilen ders, bu ay başlayan onaylı rezervasyonların toplam saatidir. Bu ay kampa gelen, bu ay yoklamada işaretlenmiş çocuk sayısıdır.':
    'Total customers leaves out the camp children, who are counted on their own card. Lessons this month is the total hours of approved bookings starting this month. At camp this month counts the children marked on the register this month.',
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
  'Müşteriler müsait saatlere talep gönderebilir.': 'Customers can request any free hour.',
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
  'Bu ay': 'This month',
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
  'Bu e-posta ile kayıtlı bir eğitmen zaten var.': 'An instructor with that email already exists.',
  'Aylık ders saati hesaplanamadı': 'Could not total this month’s hours',

  // admin menu
  'Ödemeler / Paketler': 'Payments / Packages',
  Kayıtlar: 'Registrations',
  Yoklama: 'Register',
  'Kullanım kılavuzu': 'User guide',

  // camp register
  'Gün seç': 'Pick a day',
  'Yoklama ekle': 'Take the register',
  'Yukarıdaki ders rakamlarına çocuk kampı saatleri dahil değildir.':
    'The lesson figures above leave out the camp hours.',
  'Çocuk kampı öğrencileri bu listede yok; Çocuk Kampı sekmesinde tutuluyor.':
    'Camp children are not in this list; they are kept under Çocuk Kampı.',
  Gelmedi: 'Did not come',
  Sağlık: 'Health',
  'Listede yoksa kampa kaydet': 'Not on the list? Register them for the camp',
  'Kampa kaydet': 'Register',
  'Bu çocuk zaten listede.': 'That child is already on the list.',
  '{n} kampa kaydedildi. Bugün geldiyse listeden işaretleyin.':
    '{n} is registered for the camp. Tick them above if they came today.',
  'Kampa kaydetmek yoklamaya eklemez; geldiyse yukarıdan işaretleyin.':
    'Registering does not mark anyone present — tick them above if they came.',
  'Bu çocuğun bu günkü yoklamasını sil': 'Clear this child’s mark for this day',
  'İşaretlenmeyen çocuk o gün gelmemiş sayılır. Sil, o günkü işareti kaldırır.':
    'A child left unmarked did not come that day. Sil clears the mark for that day.',
  '{n} için bu günün yoklaması silinsin mi?': 'Clear this day’s mark for {n}?',
  '{d} günündeki tüm yoklama silinsin mi?': 'Delete the whole register for {d}?',
  'Bu güne git': 'Go to this day',
  Seç: 'Select',
  'çocuk seçildi': 'children selected',
  'Seçimi bırak': 'Clear the selection',
  'Seçilenleri yoklamadan sil': 'Remove the selected from the register',
  'Seçilen çocukların bu gün için yoklaması yok.':
    'None of the selected children are marked for this day.',
  '{n} çocuğun bu günkü yoklaması silinsin mi?': 'Clear this day’s mark for {n} children?',
  'Liste görünümünü aç': 'Show the list',
  'Liste görünümünü kapat': 'Hide the list',
  'Kampa gelen çocuk': 'Children who came',
  'Günü sil': 'Delete the day',
  'Yoklama silinemedi': 'Could not delete the register',
  'Hangi gün': 'Which day',
  'Çocuk ara': 'Search for a child',
  'İlk harfleri yazın': 'Type the first letters',
  'Bu isimde çocuk yok. Aşağıdan yeni çocuk ekleyin.':
    'No child by that name. Add a new one below.',
  'Listede yoksa yeni çocuk ekle': 'Not on the list? Add a new child',
  'Bu çocuk zaten listede, işaretlendi.': 'That child is already on the list, and is now ticked.',
  Seçilenler: 'Selected',
  'yarım gün': 'half day',
  'geçen sezon': 'last season',
  yeni: 'new',
  'Henüz kimse seçilmedi. Hepsi tam gün sayılır.':
    'Nobody selected yet. Everyone ticked counts as a full day.',
  'Yoklamayı tamamla': 'Finish the register',
  'Yeni çocuklar eklendi': 'New children added',
  'Kamp formlarını şimdi doldurabilirsin: veli, telefon, alerji ve belgeler.':
    'You can fill in their camp forms now: guardian, phone, allergies and documents.',
  'Form oluştur': 'Fill in the form',
  'Çocuk ekle': 'Add a child',
  '— yeni çocuk —': '— new child —',
  'Adı soyadı': 'Full name',
  'Çocuğun adı': 'The child’s name',
  'Gün tipi': 'Full or half day',
  'Detaylı form': 'Full form',
  'Veli, alerji ve form sayfaları sonradan Kayıtlar sekmesinden eklenebilir.':
    'Guardian, allergies and the form pages can be added later from Registrations.',
  'Tam gün': 'Full day',
  'Yarım gün': 'Half day',
  tam: 'full',
  yarım: 'half',
  'Toplam gün': 'Total days',
  'Sezon toplamı': 'Season total',
  'Gün gün': 'Day by day',
  'Henüz yoklama yok.': 'Nothing recorded yet.',
  'İşaretlenmeyen çocuk o gün gelmemiş sayılır. Aynı düğmeye tekrar basmak işareti kaldırır.':
    'A child left unmarked did not come that day. Press the same button again to clear a mark.',

  // guide
  'Yönetici olarak hoca hakedişleri dahil her şeyi görürsün.':
    'As yönetici you see everything, instructor pay included.',
  'Admin olarak hoca hakedişleri dışında her şeyi görür ve düzenlersin.':
    'As admin you see and edit everything except instructor pay.',
  'Sık sorulanlar': 'Common questions',

  'Takvime ders yazmak': 'Booking a lesson on the calendar',
  'Ders kaydının tek yeri takvim. Rezervasyonlar sekmesi sonradan bakmak içindir.':
    'The calendar is the only place lessons are created. The Bookings tab is for looking back at them.',
  'Hocanın sütununda başlangıç saatine bas, bırakmadan aşağı sürükle: birden çok saati tek seferde seçersin.':
    'In the instructor’s column press the first hour and drag down without letting go: you pick several hours at once.',
  'Ders tipini seç (bireysel, grup, çocuk kampı) ve windsurf mü wingfoil mü olduğunu işaretle.':
    'Choose the lesson type (individual, group, kids camp) and whether it is windsurf or wingfoil.',
  'Kimin adına: müşteri adını yaz ya da listeden seç. Kayıtlı değilse aynı yerden yeni müşteri açılır; telefon zorunlu değil.':
    'Who it is for: type the customer’s name or pick it from the list. If they are new you can create them right there; the phone number is optional.',
  'Adı olmayan bir ders için Misafir işaretle. Misafir dersleri ana sayfadaki sayılara varsayılan olarak girmez, isteyen kutucuğu işaretler.':
    'For a lesson with no name, tick Guest. Guest lessons are left out of the home figures by default; tick the box to include them.',
  'Çocuk kampında isim sorulmaz; saatleri seçip kaydetmen yeter.':
    'Kids camp asks for no name: pick the hours and save.',

  'Yazılmış bütün derslerin listesi; arama, filtre ve Excel çıktısı burada.':
    'Every lesson that has been booked, with search, filters and the Excel export.',
  'Hoca, tarih aralığı, spor ve misafir/müşteri filtrelerini birlikte kullanabilirsin.':
    'Instructor, date range, sport and guest/customer filters all work together.',
  'Bir dersi düzenlemek ya da silmek için satırdaki düğmeleri kullan; silinen ders saati takvimde hemen boşalır.':
    'Use the buttons on the row to edit or delete a lesson; a deleted lesson frees the hour on the calendar at once.',
  'Excel’e aktar, o an ekranda görünen listeyi indirir.':
    'Export to Excel downloads exactly the list on screen.',

  'Kimin ne aldığı ve ne kadar ödediği. Bir müşterinin aynı anda birden çok anlaşması olabilir.':
    'Who bought what and how much they have paid. One customer can hold several agreements at once.',
  'Yeni anlaşma: müşteriyi seç, türünü seç (tek ders, 5/10/20 ders paketi, kiralama, depolama, çocuk kampı, diğer), anlaşılan tutarı yaz.':
    'New agreement: pick the customer, pick the kind (single lesson, 5/10/20 lesson package, rental, storage, kids camp, other) and enter the agreed amount.',
  'Ödeme aldıkça Ödeme ekle ile gir; bakiye kendiliğinden düşer.':
    'Enter each payment as it comes in with Add payment; the balance follows on its own.',
  'Kalanı silmek gerekirse Bakiyeyi sıfırla — bu da bir kayıt olarak durur, tutar geçmişten kaybolmaz.':
    'To write the rest off use Clear the balance — that is kept as a record too, so nothing disappears from the history.',
  'Paketlerde kalan ders sayısı takip edilir: ders yazarken paketi seçersen o dersten düşer.':
    'Packages keep count of the lessons left: pick the package while booking and the lesson comes off it.',

  'Okulun defteri: ders alanlar, kiralama, depolama ve çocuk kampı aynı listede.':
    'The school’s book: lessons, rental, storage and kids camp in one list.',
  'Kart açıldığında telefon, doğum tarihi, sağlık/alerji notu, veli ve acil durum bilgileri görünür.':
    'Opening a card shows the phone, date of birth, health and allergy notes, guardian and emergency contacts.',
  'İlgi alanı (ders / kiralama / depolama / çocuk kampı) birden çok seçilebilir; filtreler buna göre çalışır.':
    'A customer can be in several segments (lessons / rental / storage / kids camp); the filters follow them.',
  'Not eklemek için kartın altındaki not alanını kullan.':
    'Use the note field at the bottom of the card to add a note.',
  'Bir müşteri, dersleri ve anlaşmaları duruyorken silinmez; uyarı sana neyin engellediğini söyler.':
    'A customer cannot be deleted while lessons or agreements still hang off them; the warning names what is in the way.',

  'Çocuk kampı — Kayıtlar': 'Kids camp — Registrations',
  'Her sezon ayrı bir kayıttır: aynı çocuk 2026 ve 2027 için ayrı ayrı kaydedilir, eski kayıt bozulmaz.':
    'Each season is its own registration: the same child is registered separately for 2026 and 2027, and the older one is left untouched.',
  'Üstteki yıl kutusundan sezonu seç, sonra Kamp Kaydı Ekle.':
    'Pick the season from the year box at the top, then Add camp registration.',
  'Daha önce gelmiş bir çocuk için Önceki sezonlardan öğrenci listesinden seç: bilgiler hazır gelir, sadece değişenleri düzelt.':
    'For a child who has been before, pick them from Students from earlier seasons: the details come filled in and you only correct what changed.',
  'Veli formu, sağlık raporu gibi belgeleri yükleyebilir, sonra aynı yerden indirebilirsin.':
    'Consent forms, medical reports and the like can be uploaded and downloaded again from the same place.',

  'Çocuk kampı — Yoklama': 'Kids camp — Register',
  'Günlük tutulur ve tek ekranda biter: kim geldi, kim yarım gün kaldı.':
    'Kept daily and finished on one screen: who came, and who went home at lunch.',
  'Yoklama ekle: gün hazır gelir (istersen değiştir), gelen çocukları listeden işaretle. İsim aramak için ilk harfleri yazman yeter.':
    'Take the register: the day is already filled in (change it if you need to) and you tick the children who came. Typing the first letters of a name is enough to find it.',
  'İşaretlenen herkes tam gün sayılır. Aşağıdaki seçilenler listesinde yarım gün kalanları işaretle, sonra Yoklamayı tamamla.':
    'Everyone ticked counts as a full day. In the selected list below, tick whoever stayed half a day, then finish the register.',
  'Listede olmayan çocuğu alttaki kutuya yazıp kampa kaydet. Kampa kaydetmek yoklamaya eklemez; geldiği gün listeden işaretlemen gerekir. Geçen sezon gelmiş çocuklar zaten listede çıkar.':
    'A child who is not on the list is typed into the box underneath and registered for the camp. Registering does not mark them present — you still tick them on the day they come. Children from last season are already in the list.',
  'Yeni çocuk eklediysen, yoklama bitince kamp formunu doldurman için soruluyor — istersen sonra Kayıtlar sekmesinden doldur.':
    'If you added a new child, you are asked to fill in their camp form once the register is done — or leave it for later, from Registrations.',
  'Düzeltme ve silme: günün listesinde Tam gün / Yarım gün düğmeleri ve Sil, gün gün listesinde ise Günü sil o günün tamamını kaldırır.':
    'Corrections and deletions: the day’s list has full day, half day and Sil for one child, and the day-by-day list has Delete the day for the whole of it.',
  'Sezon toplamı tablosunda her çocuğun kaç tam, kaç yarım gün geldiği toplanır (yarım gün 0,5 sayılır).':
    'The season total adds up each child’s full and half days (a half day counts as 0.5).',
  'Gün gün listesi hangi gün kimlerin geldiğini gösterir; Excel’e aktarabilirsin.':
    'The day-by-day list shows who came on each day, and exports to Excel.',

  'Hoca profilleri, çalışma şekli ve izinler.':
    'Instructor profiles, how they are employed, and time off.',
  'Hoca ekle: ad, hangi sporları verdiği ve çalışma şekli (maaşlı, freelance, diğer).':
    'Add an instructor: name, which sports they teach and how they work (salaried, freelance, other).',
  'İzin ya da kapalı gün girmek için hocanın satırındaki izin düğmesini kullan; o saatler takvimde kapanır.':
    'Use the time-off button on the instructor’s row for leave or closed days; those hours close on the calendar.',
  'Bir hoca kendi takviminde ders yazabilir ve kendi öğrencilerinin detayını görür; diğer hocaların takvimini yalnızca dolu/boş olarak görür.':
    'An instructor can book on their own calendar and sees their own students’ details; other instructors’ calendars show only busy or free.',

  'Kimin giriş yapabildiği ve ne görebildiği.': 'Who can sign in, and what they can see.',
  'Kullanıcı ekle: e-posta gir, davet gönder. Kişi kendi şifresini kendi belirler, sonra da değiştirebilir.':
    'Add a user: enter the email and send the invitation. They set their own password and can change it later.',
  'Yetkiler: Admin ya da Yönetici — ikisi birden olmaz. Her ikisi de ayrıca Hoca olabilir.':
    'Permissions: admin or yönetici — never both. Either can also be an instructor.',
  'Yönetici her şeyi görür. Admin, hoca hakedişleri dışında her şeyi görür.':
    'A yönetici sees everything. An admin sees everything except instructor pay.',
  'Hesabın hoca profili yoksa satırın altındaki küçük düğmeden oluşturabilirsin.':
    'If an account has no instructor profile, the small button under the row creates one.',

  'Ana sayfa ve raporlama': 'Home and reporting',
  'Bugün, Bu hafta ve Bu ay hazır düğmeleri; istediğin tarih aralığını da elle yazabilirsin.':
    'Today, This week and This month are one click, and any date range can be typed in.',
  'Grafikler seçilen tarih aralığına göre çalışır: hoca başına saat, ders tipi ve spor dağılımı.':
    'The charts follow the chosen dates: hours per instructor, lesson types and sports.',
  'Hoca filtresinden birden çok hoca seçilebilir.':
    'The instructor filter takes more than one instructor.',
  'Misafir derslerini saymak istersen kutucuğu işaretle; varsayılan olarak sayılmazlar.':
    'Tick the box to count guest lessons; they are left out by default.',
  'Her listenin Excel’e aktar düğmesi, ekrandaki filtrelenmiş hâli indirir.':
    'Every list’s Export to Excel button downloads the filtered view on screen.',

  'Hoca hakedişleri': 'Instructor pay',
  'Yalnızca yöneticinin gördüğü kısım.': 'Visible to the yönetici only.',
  'Hoca kartındaki komisyon oranını yönetici belirler; adminler bu alanı ne görür ne değiştirir.':
    'The yönetici sets the commission rate on the instructor card; admins neither see nor change it.',
  'Verilen saatler ile oran, hoca bazlı hakediş tablosunda birleşir.':
    'Hours taught and the rate come together in the per-instructor pay table.',

  'Bir dersi yanlış hocaya yazdım, ne yapacağım?':
    'I booked a lesson with the wrong instructor — now what?',
  'Rezervasyonlar sekmesinden dersi düzenle; hocayı ve saati oradan değiştirebilirsin.':
    'Edit the lesson from the Bookings tab; the instructor and the time can both be changed there.',
  'Müşteri adı yazmadan ders yazabilir miyim?': 'Can I book a lesson without a customer name?',
  'Evet, Misafir işaretle. Ders takvimde ve raporlarda durur, sadece müşteri kaydına bağlanmaz.':
    'Yes — tick Guest. The lesson stays on the calendar and in the reports, it is simply not tied to a customer record.',
  'Aynı çocuğu her yıl yeniden mi kaydedeceğim?': 'Do I register the same child again every year?',
  'Evet, sezon başına bir kayıt. Önceki sezonlardan öğrenci listesinden seçince bilgiler hazır gelir.':
    'Yes, one registration per season. Picking them from Students from earlier seasons fills the details in.',
  'Müşteriyi silemiyorum.': 'I cannot delete a customer.',
  'Üstünde duran ders, anlaşma ya da kamp kaydı vardır. Uyarı hangisinin engellediğini yazar; önce onları temizle.':
    'There is a lesson, an agreement or a camp registration still on them. The warning says which; clear those first.',
  'Dışarıdan biri site açarsa ne görür?': 'What does someone from outside see?',
  'Sadece hocaların takvimindeki dolu ve boş saatleri. İsim, telefon, ödeme hiçbiri görünmez ve dışarıdan rezervasyon yapılamaz.':
    'Only which hours are busy or free on the instructors’ calendars. No names, phones or payments, and nothing can be booked from outside.',
  'Şifremi unuttum.': 'I forgot my password.',
  'Giriş ekranındaki Şifremi unuttum bağlantısı e-posta gönderir; bağlantıya tıklayıp yeni şifreni belirlersin.':
    'The Forgot password link on the sign-in screen sends an email; follow the link and set a new password.',
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

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (text: string) => string;
};

const LangContext = createContext<Ctx>({
  lang: 'tr',
  setLang: () => {},
  t: (s) => s,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = readStored();
    current = l;
    return l;
  });

  useEffect(() => {
    current = lang;
    document.documentElement.lang = lang;
    document.title =
      lang === 'tr' ? 'Sun Surf Alaçatı — ders ayırt' : 'Sun Surf Alaçatı — book a lesson';
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
