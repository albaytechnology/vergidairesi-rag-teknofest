/**
 * Antet/imza/iletisim bilgileri.
 *
 * Varsayilani ortam degiskenlerinden gelir; override edilebilir olmasi hem
 * testi env'den bagimsiz kilar hem de ileride tek kurulumun birden fazla vergi
 * dairesine yazi uretmesine izin verir.
 */
import { config } from "@albay/shared";

export interface KurumBilgileri {
  kurumAdi: string;
  birimAdi: string;
  detsisNo: string;
  dosyaPlani: string;
  imzaAd: string;
  imzaUnvan: string;
  adres: string;
  telefon: string;
  eposta: string;
  web: string;
  kep: string;
}

export const kurumBilgileriFromConfig = (): KurumBilgileri => ({
  kurumAdi: config.LETTER_KURUM_ADI,
  birimAdi: config.LETTER_BIRIM_ADI,
  detsisNo: config.LETTER_DETSIS_NO,
  dosyaPlani: config.LETTER_DOSYA_PLANI,
  imzaAd: config.LETTER_IMZA_AD,
  imzaUnvan: config.LETTER_IMZA_UNVAN,
  adres: config.LETTER_ADRES,
  telefon: config.LETTER_TELEFON,
  eposta: config.LETTER_EPOSTA,
  web: config.LETTER_WEB,
  kep: config.LETTER_KEP,
});
