/**
 * Sohbette acilan "cevap yazisi olustur" kartinin gecmise yazilmasi.
 *
 * Once bu alisveris KAYDEDILMIYORDU: kart bir eylem alani sayilmis, kayda deger
 * bir cevap olarak gorulmemisti. Sonuc, calisanin sordugu sorunun da ekrandan
 * silinmesiydi — sayfa yenilendiginde "bunu reddedecek bir cevap yazisi yaz"
 * mesaji gecmiste hic yer almiyordu. Soru sorulmustu; gecmis onu gostermeli.
 *
 * letter_intent, asistan mesajinin bir METIN degil KART oldugunu ve kartin hangi
 * karar/gerekce onerisiyle acildigini tasir; arayuz gecmisi yeniden kurarken
 * karti bu alandan tanir.
 */
export const sql = `
  ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS letter_intent JSONB;
`;
