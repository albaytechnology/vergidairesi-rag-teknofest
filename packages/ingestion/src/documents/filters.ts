/**
 * Servis havuzlarindan ve arsivden oturuma ozel ekleri eleyen kosul.
 *
 * Sohbete aticlanan belge (ek mevzuat, mukellefin gonderdigi ek) RESMI EVRAK
 * DEGILDIR: havuza dusmesi, sayaci artirmasi ya da cevap yazisi beklemesi
 * gereken bir basvuru degil, yalnizca o sohbetin baglami.
 *
 * Onceden bu ayrim session_uploads'taki TTL'li kayittan turetiliyordu ve 12 saat
 * dolunca chat ekleri havuzlara geri dusuyordu. Kalici bir olguyu gecici bir
 * kayitla ifade etmek hataydi; artik documents.session_id sutununa bakiyoruz.
 */
export const OTURUM_EKI_DEGIL = "session_id IS NULL";
