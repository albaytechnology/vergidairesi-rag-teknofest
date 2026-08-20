/**
 * A4 baski ve ekran onizleme stili.
 *
 * Olculer yonetmelige gore: A4, her yandan 2,5 cm bosluk, Times New Roman 12
 * punto, iletisim blogu 8 punto. Ayri dosyada durmasinin sebebi boyu degil
 * cinsi: burasi gorsel karar alani, sablonun geri kalani metin uretimi.
 */
export const STIL = `
@page { size: A4; margin: 2.5cm; }
* { box-sizing: border-box; }
body {
  font-family: "Times New Roman", Times, serif;
  font-size: 12pt;
  line-height: 1.4;
  color: #000;
  background: #fff;
  margin: 0;
}
body.onizleme { background: #e9e9ec; padding: 24px 0; }
body.onizleme .sayfa {
  width: 21cm;
  min-height: 29.7cm;
  margin: 0 auto;
  padding: 2.5cm;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0,0,0,.18);
}
.sayfa { position: relative; }

.filigran {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-32deg);
  font-size: 84pt;
  font-weight: bold;
  letter-spacing: .12em;
  color: rgba(190, 30, 30, .13);
  pointer-events: none;
  white-space: nowrap;
}

.antet { text-align: center; line-height: 1.25; }
.antet div:nth-child(2) { font-weight: bold; }

.sayi-satiri {
  display: flex;
  justify-content: space-between;
  margin-top: 1.5em;
}
.konu { margin-top: .2em; max-width: 60%; }

.muhatap { margin: 2.5em 0 1.5em; text-align: center; }
.muhatap-ad { font-weight: bold; }
.muhatap-no, .muhatap-adres { font-size: 11pt; }

.ilgi { display: flex; gap: .4em; margin-bottom: 1em; }
.ilgi-satir { margin-bottom: .15em; }

.metin p { margin: 0 0 .6em; text-align: justify; text-indent: 1.25cm; }
.metin .kapanis { margin-top: 1em; }

.imza { margin-top: 2.5em; text-align: right; }
.imza-ad { }
.imza-unvan { }

.ek, .dagitim { margin-top: 1.5em; font-size: 11pt; }
.blok-etiket { font-weight: bold; }

.eksik {
  background: #ffe9a8;
  border-bottom: 1px dashed #b07800;
  padding: 0 2px;
}

.taslak-notu {
  margin-top: 2em;
  padding: .4em .6em;
  border: 1px solid #b02020;
  color: #b02020;
  font-size: 9pt;
  text-align: center;
}

.iletisim {
  margin-top: 2em;
  padding-top: .4em;
  border-top: 1px solid #000;
  font-size: 8pt;
  line-height: 1.3;
}

@media print {
  body.onizleme { background: #fff; padding: 0; }
  body.onizleme .sayfa {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .eksik { background: none; }
}
`;
