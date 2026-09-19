import { useState } from 'react';
import { useT } from '../../lib/i18n';
import type { Viewer } from '../../types';

/** Who a section is written for. Everything unmarked is for everybody. */
type Audience = 'all' | 'owner';

type Section = {
  title: string;
  /** One line saying what the screen is for, before the steps. */
  lead: string;
  steps: string[];
  audience?: Audience;
};

const SECTIONS: Section[] = [
  {
    title: 'Takvime ders yazmak',
    lead: 'Ders kaydının tek yeri takvim. Rezervasyonlar sekmesi sonradan bakmak içindir.',
    steps: [
      'Hocanın sütununda başlangıç saatine bas, bırakmadan aşağı sürükle: birden çok saati tek seferde seçersin.',
      'Ders tipini seç (bireysel, grup, çocuk kampı) ve windsurf mü wingfoil mü olduğunu işaretle.',
      'Kimin adına: müşteri adını yaz ya da listeden seç. Kayıtlı değilse aynı yerden yeni müşteri açılır; telefon zorunlu değil.',
      'Adı olmayan bir ders için Misafir işaretle. Misafir dersleri ana sayfadaki sayılara varsayılan olarak girmez, isteyen kutucuğu işaretler.',
      'Geçmiş günlere de yazabilir, geçmiş bir dersi düzeltebilir ya da silebilirsin: adminler her takvimde, hocalar kendi takvimlerinde.',
      'Çocuk kampında isim sorulmaz; saatleri seçip kaydetmen yeter.',
    ],
  },
  {
    title: 'Rezervasyonlar',
    lead: 'Yazılmış bütün derslerin listesi; arama, filtre ve Excel çıktısı burada.',
    steps: [
      'Hoca, tarih aralığı, spor ve misafir/müşteri filtrelerini birlikte kullanabilirsin.',
      'Bir dersi düzenlemek ya da silmek için satırdaki düğmeleri kullan; silinen ders saati takvimde hemen boşalır.',
      'Excel’e aktar, o an ekranda görünen listeyi indirir.',
    ],
  },
  {
    title: 'Ödemeler / Paketler',
    lead: 'Kimin ne aldığı ve ne kadar ödediği. Bir müşterinin aynı anda birden çok anlaşması olabilir.',
    steps: [
      'Yeni anlaşma: müşteriyi seç, türünü seç (tek ders, 5/10/20 ders paketi, kiralama, depolama, çocuk kampı, diğer), anlaşılan tutarı yaz.',
      'Ödeme aldıkça Ödeme ekle ile gir; bakiye kendiliğinden düşer.',
      'Kalanı silmek gerekirse Bakiyeyi sıfırla — bu da bir kayıt olarak durur, tutar geçmişten kaybolmaz.',
      'Paketlerde kalan ders sayısı takip edilir: ders yazarken paketi seçersen o dersten düşer.',
    ],
  },
  {
    title: 'Müşteriler',
    lead: 'Okulun defteri: ders alanlar, kiralama, depolama ve çocuk kampı aynı listede.',
    steps: [
      'Kart açıldığında telefon, doğum tarihi, sağlık/alerji notu, veli ve acil durum bilgileri görünür.',
      'İlgi alanı (ders / kiralama / depolama / çocuk kampı) birden çok seçilebilir; filtreler buna göre çalışır.',
      'Not eklemek için kartın altındaki not alanını kullan.',
      'Bir müşteri, dersleri ve anlaşmaları duruyorken silinmez; uyarı sana neyin engellediğini söyler.',
    ],
  },
  {
    title: 'Çocuk kampı — Kayıtlar',
    lead: 'Her sezon ayrı bir kayıttır: aynı çocuk 2026 ve 2027 için ayrı ayrı kaydedilir, eski kayıt bozulmaz.',
    steps: [
      'Üstteki yıl kutusundan sezonu seç, sonra Kamp Kaydı Ekle.',
      'Daha önce gelmiş bir çocuk için Önceki sezonlardan öğrenci listesinden seç: bilgiler hazır gelir, sadece değişenleri düzelt.',
      'Veli formu, sağlık raporu gibi belgeleri yükleyebilir, sonra aynı yerden indirebilirsin.',
    ],
  },
  {
    title: 'Çocuk kampı — Yoklama',
    lead: 'Günlük tutulur ve tek ekranda biter: kim geldi, kim yarım gün kaldı.',
    steps: [
      'Yoklama ekle: gün hazır gelir (istersen değiştir), gelen çocukları listeden işaretle. İsim aramak için ilk harfleri yazman yeter.',
      'İşaretlenen herkes tam gün sayılır. Aşağıdaki seçilenler listesinde yarım gün kalanları işaretle, sonra Yoklamayı tamamla.',
      'Listede olmayan çocuğu alttaki kutuya yazıp kampa kaydet. Kampa kaydetmek yoklamaya eklemez; geldiği gün listeden işaretlemen gerekir. Geçen sezon gelmiş çocuklar zaten listede çıkar.',
      'Yeni çocuk eklediysen, yoklama bitince kamp formunu doldurman için soruluyor — istersen sonra Kayıtlar sekmesinden doldur.',
      'Düzeltme ve silme: günün listesinde Tam gün / Yarım gün düğmeleri ve Sil, gün gün listesinde ise Günü sil o günün tamamını kaldırır.',
      'Sezon toplamı tablosunda her çocuğun kaç tam, kaç yarım gün geldiği toplanır (yarım gün 0,5 sayılır).',
      'Gün gün listesi hangi gün kimlerin geldiğini gösterir; Excel’e aktarabilirsin.',
    ],
  },
  {
    title: 'Hocalar',
    lead: 'Hoca profilleri, çalışma şekli ve izinler.',
    steps: [
      'Hoca ekle: ad, hangi sporları verdiği ve çalışma şekli (maaşlı, freelance, diğer).',
      'İzin ya da kapalı gün girmek için hocanın satırındaki izin düğmesini kullan; o saatler takvimde kapanır.',
      'Bir hoca kendi takviminde ders yazabilir ve kendi öğrencilerinin detayını görür; diğer hocaların takvimini yalnızca dolu/boş olarak görür.',
    ],
  },
  {
    title: 'Hesaplar ve yetkiler',
    lead: 'Kimin giriş yapabildiği ve ne görebildiği.',
    steps: [
      'Kullanıcı ekle: e-posta gir, davet gönder. Kişi kendi şifresini kendi belirler, sonra da değiştirebilir.',
      'Yetkiler: Admin ya da Yönetici — ikisi birden olmaz. Her ikisi de ayrıca Hoca olabilir.',
      'Yönetici her şeyi görür. Admin, hoca hakedişleri dışında her şeyi görür.',
      'Hesabın hoca profili yoksa satırın altındaki küçük düğmeden oluşturabilirsin.',
    ],
  },
  {
    title: 'Ana sayfa ve raporlama',
    lead: 'Bugün, Bu hafta ve Bu ay hazır düğmeleri; istediğin tarih aralığını da elle yazabilirsin.',
    steps: [
      'Grafikler seçilen tarih aralığına göre çalışır: hoca başına saat, ders tipi ve spor dağılımı.',
      'Hoca filtresinden birden çok hoca seçilebilir.',
      'Misafir derslerini saymak istersen kutucuğu işaretle; varsayılan olarak sayılmazlar.',
      'Her listenin Excel’e aktar düğmesi, ekrandaki filtrelenmiş hâli indirir.',
    ],
  },
  {
    title: 'Değişiklik kaydı',
    audience: 'owner',
    lead: 'Kim ne zaman neyi değiştirdi — yalnızca yöneticinin gördüğü kayıt.',
    steps: [
      'Kılavuzun altındaki Değişiklik kaydı sekmesinde: rezervasyonlar, çocuk kampı yoklaması, paketler ve ödemeler, hesap ve yetki değişiklikleri, müşteri kaydı düzenleme ve silme.',
      'Kayıtları veritabanı yazar; uygulamadan değiştirilemez, silinemez.',
      '90 günden eski kayıtlar silinir. Daha eskisi sorulacaksa önce Excel’e aktarın.',
      'Müşteri ya da çocuk kaydının açılması loglanmaz — her gün olan şey kaydı doldurur, bir soruya cevap vermez.',
    ],
  },
  {
    title: 'Hoca hakedişleri',
    audience: 'owner',
    lead: 'Yalnızca yöneticinin gördüğü kısım.',
    steps: [
      'Hoca kartındaki komisyon oranını yönetici belirler; adminler bu alanı ne görür ne değiştirir.',
      'Verilen saatler ile oran, hoca bazlı hakediş tablosunda birleşir.',
    ],
  },
];

/** The short answers to the questions that get asked more than once. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Bir dersi yanlış hocaya yazdım, ne yapacağım?',
    a: 'Rezervasyonlar sekmesinden dersi düzenle; hocayı ve saati oradan değiştirebilirsin.',
  },
  {
    q: 'Müşteri adı yazmadan ders yazabilir miyim?',
    a: 'Evet, Misafir işaretle. Ders takvimde ve raporlarda durur, sadece müşteri kaydına bağlanmaz.',
  },
  {
    q: 'Aynı çocuğu her yıl yeniden mi kaydedeceğim?',
    a: 'Evet, sezon başına bir kayıt. Önceki sezonlardan öğrenci listesinden seçince bilgiler hazır gelir.',
  },
  {
    q: 'Müşteriyi silemiyorum.',
    a: 'Üstünde duran ders, anlaşma ya da kamp kaydı vardır. Uyarı hangisinin engellediğini yazar; önce onları temizle.',
  },
  {
    q: 'Dışarıdan biri site açarsa ne görür?',
    a: 'Sadece hocaların takvimindeki dolu ve boş saatleri. İsim, telefon, ödeme hiçbiri görünmez ve dışarıdan rezervasyon yapılamaz.',
  },
  {
    q: 'Şifremi unuttum.',
    a: 'Giriş ekranındaki Şifremi unuttum bağlantısı e-posta gönderir; bağlantıya tıklayıp yeni şifreni belirlersin.',
  },
];

type Props = { viewer: Viewer };

/**
 * The manual, for the people who actually run the school.
 *
 * One scrollable page with collapsed sections rather than a document kept
 * somewhere else, because a guide that is not in the product is a guide nobody
 * opens. The yönetici sees one section more than the admin — the same rule the
 * rest of the app follows.
 */
export default function Guide({ viewer }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(SECTIONS[0].title);

  const sections = SECTIONS.filter((s) => s.audience !== 'owner' || viewer.isOwner);

  return (
    <section className="guide">
      <div className="admin-bar">
        <h2 className="admin-title">{t('Kullanım kılavuzu')}</h2>
        <span className="admin-count">{t(viewer.isOwner ? 'Yönetici' : 'Admin')}</span>
      </div>

      <p className="admin-hint">
        {t(
          viewer.isOwner
            ? 'Yönetici olarak hoca hakedişleri dahil her şeyi görürsün.'
            : 'Admin olarak hoca hakedişleri dışında her şeyi görür ve düzenlersin.',
        )}
      </p>

      <div className="guide-list">
        {sections.map((s) => {
          const isOpen = open === s.title;
          return (
            <section key={s.title} className={`panel guide-item${isOpen ? ' is-open' : ''}`}>
              <button
                className="guide-head"
                onClick={() => setOpen(isOpen ? null : s.title)}
                aria-expanded={isOpen}
              >
                <span className="panel-title">{t(s.title)}</span>
                <span className="guide-chevron" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (
                <div className="guide-body">
                  <p className="guide-lead">{t(s.lead)}</p>
                  <ol className="guide-steps">
                    {s.steps.map((step) => (
                      <li key={step}>{t(step)}</li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <h3 className="section-title">{t('Sık sorulanlar')}</h3>
      <div className="guide-faq">
        {FAQ.map((f) => (
          <article key={f.q} className="panel">
            <h4 className="panel-title">{t(f.q)}</h4>
            <p className="guide-lead">{t(f.a)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
