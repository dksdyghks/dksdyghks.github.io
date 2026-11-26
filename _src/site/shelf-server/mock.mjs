// A stand-in for Cloudflare's runtime, for testing worker.js on this machine: an R2 bucket kept in a folder,
// and a plain HTTP server that hands each request to the worker. Not deployed anywhere.
//   node mock.mjs <port> <data-dir> <allowed-origins> <pepper> <pin-hash>
//   SHELF_FAKE_DATA=1 node mock.mjs …   the same, offline, with 헌재 소식·위헌 법령·국회입법조사처·행정심판 played by fakeData
//   GET /__scheduled[?time=<ms>]        runs the cron once (as wrangler dev has it); answers what it did
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import worker from './worker.js';

// Cloudflare's edge cache (caches.default), kept in memory here: put keeps a response for its max-age, match gives it back
if (!globalThis.caches) {
  const kept = new Map();
  const keyOf = (req) => (typeof req === 'string' ? req : req.url);
  globalThis.caches = {
    default: {
      async match(req) { const e = kept.get(keyOf(req)); if (!e || e.until < Date.now()) return undefined; return new Response(e.body, { headers: e.headers }); },
      async put(req, res) { const age = Number((/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [])[1] || 0); kept.set(keyOf(req), { body: await res.text(), headers: [...res.headers], until: Date.now() + age * 1000 }); },
      async delete(req) { return kept.delete(keyOf(req)); },
    },
  };
}

export class MockR2 {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); this.mpu = new Map(); }
  #file(key) { return path.join(this.dir, encodeURIComponent(key)); }
  #meta(key) { return this.#file(key) + '.meta.json'; }
  #obj(key, size, m) {
    return { key, size, etag: m.etag, httpEtag: '"' + m.etag + '"', uploaded: new Date(m.uploaded), httpMetadata: m.httpMetadata || {}, customMetadata: m.customMetadata || {},
      writeHttpMetadata(h) { if (m.httpMetadata?.contentType) h.set('content-type', m.httpMetadata.contentType); } };
  }
  async head(key) {
    if (!fs.existsSync(this.#file(key))) return null;
    const m = JSON.parse(fs.readFileSync(this.#meta(key), 'utf8'));
    return this.#obj(key, fs.statSync(this.#file(key)).size, m);
  }
  async get(key, opts = {}) {
    const h = await this.head(key);
    if (!h) return null;
    let buf = fs.readFileSync(this.#file(key));
    let range;
    if (opts.range) {
      const r = opts.range;
      const off = 'suffix' in r ? Math.max(0, buf.length - r.suffix) : (r.offset || 0);
      const len = 'length' in r ? r.length : buf.length - off;
      buf = buf.subarray(off, off + len); range = { offset: off, length: buf.length };
    }
    const bytes = new Uint8Array(buf);
    return { ...h, range, body: new Blob([bytes]).stream(), bodyUsed: false,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => new TextDecoder().decode(bytes), json: async () => JSON.parse(new TextDecoder().decode(bytes)), blob: async () => new Blob([bytes]) };
  }
  async #bytes(value) {
    if (value == null) return new Uint8Array(0);
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    if (typeof value.getReader === 'function') return new Uint8Array(await new Response(value).arrayBuffer());
    throw new Error('mock: unsupported body');
  }
  async put(key, value, opts = {}) {
    if (opts.onlyIf && opts.onlyIf.etagMatches) {
      const h = await this.head(key);
      if (!h || h.etag !== String(opts.onlyIf.etagMatches).replace(/"/g, '')) { if (value && value.cancel) await value.cancel(); return null; }
    }
    const bytes = await this.#bytes(value);
    const m = { etag: crypto.createHash('md5').update(bytes).digest('hex'), uploaded: Date.now(), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata };
    fs.writeFileSync(this.#file(key), bytes); fs.writeFileSync(this.#meta(key), JSON.stringify(m));
    return this.#obj(key, bytes.length, m);
  }
  async delete(keys) {
    for (const k of [].concat(keys)) { for (const f of [this.#file(k), this.#meta(k)]) if (fs.existsSync(f)) fs.unlinkSync(f); }
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const keys = fs.readdirSync(this.dir).filter((f) => !f.endsWith('.meta.json')).map(decodeURIComponent).filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    const objects = [];
    for (const k of page) objects.push(await this.head(k));
    const truncated = start + limit < keys.length;
    return { objects, truncated, cursor: truncated ? String(start + limit) : undefined, delimitedPrefixes: [] };
  }
  #upload(key, uploadId) {
    const self = this;
    return {
      key, uploadId,
      async uploadPart(n, body) {
        const parts = self.mpu.get(uploadId); if (!parts) throw new Error('no such upload');
        const bytes = await self.#bytes(body);
        const etag = crypto.createHash('md5').update(bytes).digest('hex');
        parts.set(n, { bytes, etag });
        return { partNumber: n, etag };
      },
      async complete(list) {
        const parts = self.mpu.get(uploadId); if (!parts) throw new Error('no such upload');
        const chunks = [];
        for (const { partNumber, etag } of [...list].sort((a, b) => a.partNumber - b.partNumber)) {
          const p = parts.get(partNumber); if (!p || p.etag !== etag) throw new Error('bad part ' + partNumber);
          chunks.push(p.bytes);
        }
        self.mpu.delete(uploadId);
        return self.put(key, Buffer.concat(chunks.map((c) => Buffer.from(c))));
      },
      async abort() { self.mpu.delete(uploadId); },
    };
  }
  async createMultipartUpload(key) { const id = crypto.randomUUID(); this.mpu.set(id, new Map()); return this.#upload(key, id); }
  resumeMultipartUpload(key, uploadId) { return this.#upload(key, uploadId); }
}

// ---- 공공데이터포털 and 국회입법조사처, stood in for (never the real ones): the 7차 b services as they answered on 2026-11-26
// (a few real rows each, recorded through the server; more rows made up in the same shape where a test needs many).
//   const fake = fakeData({ key }); globalThis.fetch = (u, i) => fake(u, i) || realFetch(u, i);
// opts: key (the serviceKey it takes), asked (an array: every URL asked), statLatest ('YYYY-MM': the newest month the
// 헌재 statistics have), statCap / acrcCap (a page size the service gives at most, whatever is asked), acrcCount(ym)
// (how many 재결 a month has), acrcFail(ym, page) (true: that page fails), narsHttps (false: https to NARS does not answer)
const SAMPLES = {"sched": {"202611": [{"adjudgeDateTime": "202611261400", "year": "2026", "month": "11", "day": "26", "time": "1400", "viewFormat": "2026년 11월 26일 선고 14:00"}, {"adjudgeDateTime": "202611261430", "year": "2026", "month": "11", "day": "26", "time": "1430", "viewFormat": "2026년 11월 26일 선고 14:30"}], "202610": [{"adjudgeDateTime": "202610221400", "year": "2026", "month": "10", "day": "22", "time": "1400", "viewFormat": "2026년 10월 22일 선고 14:00"}]}, "day": {"202611261400": [{"eventNo": "2023헌가21", "eventNm": "구 공직선거법제93조 제1항 본문 등위헌제청", "endRsta": "심리중", "mrgInfo": "2023헌가21,2025헌가10(병합)", "decsnOutlineLink": null, "dtmPpLink": null, "reqLaw": "부산고등법원", "demdNmSub": null, "othDemdNm": null, "chgDate": "20261123"}, {"eventNo": "2025헌가10", "eventNm": "구 공직선거법제93조 제1항 본문 등위헌제청", "endRsta": "심리중", "mrgInfo": "2023헌가21,2025헌가10(병합)", "decsnOutlineLink": null, "dtmPpLink": null, "reqLaw": "서울고등법원", "demdNmSub": null, "othDemdNm": null, "chgDate": "20261123"}, {"eventNo": "2021헌마573", "eventNm": "의료법제82조 제1항 등 위헌확인", "endRsta": "심리중", "mrgInfo": "2021헌마573,2024헌바128(병합)", "decsnOutlineLink": null, "dtmPpLink": null, "reqLaw": null, "demdNmSub": null, "othDemdNm": null, "chgDate": "20261123"}, {"eventNo": "2024헌바128", "eventNm": "의료법제82조 제1항 등위헌소원", "endRsta": "심리중", "mrgInfo": "2021헌마573,2024헌바128(병합)", "decsnOutlineLink": null, "dtmPpLink": null, "reqLaw": "광주지방법원", "demdNmSub": null, "othDemdNm": null, "chgDate": "20261123"}]}, "recent": [{"eventNo": "2022헌가28", "eventNm": "화물자동차 운수사업법 제9조의2 제1항 제1호 다목 등 위헌제청", "endDate": "20261022", "endResult": "합헌", "seqNo": "4268001", "adjuDate": "20261022", "regDate": "20261022", "chgDate": null}, {"eventNo": "2025헌가7", "eventNm": "장애인활동 지원에 관한 법률 제5조 제2호 위헌제청", "endDate": "20261022", "endResult": "합헌", "seqNo": "4268002", "adjuDate": "20261022", "regDate": "20261022", "chgDate": null}, {"eventNo": "2022헌바95", "eventNm": "형법 제250조 제2항 위헌소원", "endDate": "20261022", "endResult": "합헌", "seqNo": "4268003", "adjuDate": "20261022", "regDate": "20261022", "chgDate": "20261026"}], "outline": {"4268001": {"eventNo": "2022헌가28", "eventNm": "화물자동차 운수사업법 제9조의2 제1항 제1호 다목 등 위헌제청", "endDate": "20261022", "endRsta": "합헌", "decsnOutline": "<p>&nbsp;</p><p>마약류관리법 위반자의 택배서비스사업 운전업무 종사를 제한하는 조항에 대한 위헌제청 사건</p><p>[2022헌가28 화물자동차 운수사업법 제9조의2 제1항 제1호 다목 등 위헌제청]</p><p>&nbsp;</p><p> 헌법재판소는 2026년 10월 22일 재판관 6:3의 의견으로, ‘마약류 관리에 관한 법률’을 위반하여 금고 이상의 실형을 선고받은 사람이 최대 20년의 범위 내에서 대통령령으로 정하는 기간 동안 택배서비스사업의 운전업무에 종사할 수 없도록 하고, 이를 위반한 경우 화물운송 종사자격을 필요적으로 취소하도록 한 화물자동차 운수사업법(2021. 1. 26. 법률 17911호로 개정된 것) 제9조의2 제1항 제1호 다목 및 구 화물자동차 운수사업법(2018. 8. 14. 법률 제15743호로 개정되고, 2025. 12. 2. 법률 제21190호로 개정되기 전의 것) 제23조 제1항 단서 제10호 중 ‘제9조의2 제1항 제1호 다목을 위반한 경우’에 관한 부분은 모두 헌법에 위반되지 아니한다는 결정을 선고하였다. [합헌] </p><p> 이에 대하여는 위 조항들이 과잉금지원칙에 반하여 직업의 자유를 침해한다는 재판관 3인(재판관 김상환, 정정미, 정계선)의 반대의견이 있다.</p><p>&nbsp;</p><p>&nbsp;</p><p>□ 사건개요</p><p>○ 제청신청인은 2001. 11. 28. 부산지방법원에서 마약류관리에관한법률위반(향정)죄로 징역 1년 및 몰수, 추징을 선고받고 그 형이 확정되어 복역하다가 2002. 6. 26. 형기종료로 출소하였다. 이후 제청신청인은 ‘화물자동차 운수사업법’에 따른 화물자동차 운수사업의 운전업무 종사자격(이하 ‘화물운송 종사자격’이라 한다)을 취득하고, 화물자동차 운송사업 허가를 받아 택배서비스사업의 운전업무에 계속하여 종사하여 왔다. </p><p>○ 거제시장이 2021. 11. 8. 제청신청인에게 위와 같은 전과가 있다는 이유로 제청신청인의 화물운송 종사자격 및 택배용 화물자동차 운송사업 허가를 취소하는 처분을 하자, 제청신청인은 2021. 11. 12. 위 각 처분의 취소를 구하는 소를 제기하고, 당해 사건 계속 중 ‘화물자동차 운수사업법’ 제9조의2 제1항 제1호 다목, 제23조 제1항 제10호 및 ‘화물자동차 운수사업법 시행령’ 제4조의10 제2항 제4호에 대하여 위헌법률심판제청신청을 하였다. 제청법원은 위 신청 중 일부를 받아들여, ‘화물자동차 운수사업법’ 제9조의2 제1항 제1호 다목 및 같은 법 제23조 제1항 제10호 중 ‘제9조의2 제1항 제1호 다목을 위반한 경우에 관한 부분’에 대하여 위헌법률심판을 제청하였다. </p><p>&nbsp;</p><p><p>□ 심판대상</p><p>○ 이 사건 심판대상은 &lsquo;화물자동차 운수사업법&rsquo; 제9조의2 제1항 제1호 다목이다.</p>", "adjuDate": "20261022", "regDate": "20261022", "chgDate": null}}, "hearings": [{"seqNo": "1", "gubun": "2027/상반기", "eventNo": "2026헌마1630", "eventNm": "재판취소   ", "dscsDate": "20270114", "regDate": "20261103", "chgDate": "20261102"}, {"seqNo": "2", "gubun": "2026/하반기", "eventNo": "2026헌마716", "eventNm": "재판취소   ", "dscsDate": "20261023", "regDate": "20260914", "chgDate": "20261102"}, {"seqNo": "3", "gubun": "2026/하반기", "eventNo": "2026헌마1247", "eventNm": "재판취소   ", "dscsDate": "20261021", "regDate": "20260907", "chgDate": "20261102"}, {"seqNo": "4", "gubun": "2025/하반기", "eventNo": "2024헌나7", "eventNm": "경찰청장(조지호) 탄핵    (경찰청장에 대한 탄핵심판 사건)", "dscsDate": "20251110", "regDate": "20251103", "chgDate": "20251222"}], "hearing": {"2026헌마1630": [{"seqNo": "1", "eventNo": "2026헌마1630", "eventNm": "재판취소   ", "dscsDate": "20270114", "fileList": [{"atchFileNm": "변론사건_개요(2026헌마1630).pdf", "atchFileLink": "https://www.ccourt.go.kr/common/board/Download.do?bcIdx=4268112&cbIdx=1100&streFileNm=00907473-6eec-43a8-b5e1-c50402c53471.pdf"}], "content": null, "regDate": "20261103", "chgDate": "20261102"}]}, "dscs": {"202610": [{"dscsDateTime": "202610231500 ", "year": "2026", "month": "10", "day": "23", "time": "15:00 ", "viewFormat": "2026년 10월 23일 변론 15:00 "}, {"dscsDateTime": "202610211500 ", "year": "2026", "month": "10", "day": "21", "time": "15:00 ", "viewFormat": "2026년 10월 21일 변론 15:00 "}]}, "stat": [{"lawNm": "구 공직선거법(2022. 4. 20. 법률 제18841호로 개정되고, 2023. 12. 26. 법률 제19839호로 개정되기 전의 것) 제26조 제1항 [별표 2] 시·도의회의원지역선거구구역표 중 전라북도의회의원지역선거구들 부분", "eventNo": "2022헌마1247", "rstaDate": "20251023", "rstaRsta": "헌법불합치", "precdntBook": "", "precdntPage": null}, {"lawNm": "구 공직선거법(2023. 12. 26. 법률 제19839호로 개정된 것) 제26조 제1항 [별표 2] 시·도의회의원지역선거구구역표 중 전북특별자치도의회의원지역선거구들 부분", "eventNo": "2022헌마1247", "rstaDate": "20251023", "rstaRsta": "헌법불합치", "precdntBook": "", "precdntPage": null}, {"lawNm": "국가유공자 등 예우 및 지원에 관한 법률(2019. 11. 26. 법률 제16659호로 개정된 것) 제13조 제2항 제3호 전문 전단 중  자녀 중 나이가 많은 사람을 선순위자로 정하는 부분", "eventNo": "2024헌가12", "rstaDate": "20250410", "rstaRsta": "헌법불합치", "precdntBook": "", "precdntPage": null}], "unamCnstit": [{"lawNm": "약사법", "article": null, "eventNo": "2000헌바84", "decsnDate": "20020919", "decsnOutlineLink": "https://www.ccourt.go.kr/site/kor/ex/bbs/View.do?cbIdx=1195&bcIdx=1006847", "dtmPpLink": "https://isearch.ccourt.go.kr/download.do?filePath=/st_xml/sdata3/ccourt/xmlData_new/xmlFile//2/010500/2002/09/hwp/df2000b84.hwp", "office": "보건복지부", "progress": "미정", "passDate": null, "regDate": "20110930"}, {"lawNm": "집회 및 시위에 관한 법률", "article": null, "eventNo": "2008헌가25", "decsnDate": "20090924", "decsnOutlineLink": "https://www.ccourt.go.kr/site/kor/ex/bbs/View.do?cbIdx=1195&bcIdx=1000703", "dtmPpLink": "https://isearch.ccourt.go.kr/download.do?filePath=/st_xml/sdata3/ccourt/xmlData_new/xmlFile//2/010500/2009/09/hwp/df2008k25.hwp", "office": "경찰청", "progress": "경과", "passDate": "20100630", "regDate": "20110923"}, {"lawNm": "형법", "article": null, "eventNo": "2017헌바127", "decsnDate": "20190411", "decsnOutlineLink": "https://www.ccourt.go.kr/site/kor/ex/bbs/View.do?cbIdx=1195&bcIdx=1002342", "dtmPpLink": "https://isearch.ccourt.go.kr/download.do?filePath=/st_xml/sdata3/ccourt/xmlData_new/xmlFile//2/010500/2019/04/hwp/df2017b127.hwp", "office": "법무부", "progress": "경과", "passDate": "20201231", "regDate": "20210304"}], "unamVio": [{"lawNm": "국가보안법", "article": null, "eventNo": "90헌마82", "decsnDate": "19920414", "decsnOutlineLink": null, "dtmPpLink": "https://isearch.ccourt.go.kr/download.do?filePath=/st_xml/sdata3/ccourt/xmlData_new/xmlFile//2/010500/1992/04/hwp/df90m82.hwp", "office": "법무부", "regDate": "20110923"}, {"lawNm": "국가보안법", "article": null, "eventNo": "2002헌가5", "decsnDate": "20021128", "decsnOutlineLink": null, "dtmPpLink": "https://isearch.ccourt.go.kr/download.do?filePath=/st_xml/sdata3/ccourt/xmlData_new/xmlFile//2/010500/2002/11/hwp/df2002k5.hwp", "office": "법무부", "regDate": "20110923"}, {"lawNm": "정당법", "article": null, "eventNo": "2012헌마431", "decsnDate": "20140128", "decsnOutlineLink": "https://www.ccourt.go.kr/site/kor/ex/bbs/View.do?cbIdx=1195&bcIdx=1001723", "dtmPpLink": "https://isearch.ccourt.go.kr/download.do?filePath=/st_xml/sdata3/ccourt/xmlData_new/xmlFile//2/010500/2014/01/hwp/df2012m431.hwp", "office": "중앙선거관리위원회", "regDate": "20140207"}], "nars": [{"DATA_ID": "BDM00000018503", "PDF_FILE_NM": "(이슈와논점-20261126)거부권과 견제 사이, 트럼프 행정부 후반기 전망: 2026년 미국 중간선거 결과와 대미 의회외교 강화 등 정책적 함의.pdf", "PDF_FILE_URL": "http://www.nars.go.kr/fileDownload2.do?doc_id=1Q8GqL7SYg9&fileName=(%EC%9D%B4%EC%8A%88%EC%99%80%EB%85%BC%EC%A0%90-20261126)%EA%B1%B0%EB%B6%80%EA%B6%8C%EA%B3%BC%20%EA%B2%AC%EC%A0%9C%20%EC%82%AC%EC%9D%B4,%20%ED%8A%B8%EB%9F%BC%ED%94%84%20%ED%96%89%EC%A0%95%EB%B6%80%20%ED%9B%84%EB%B0%98%EA%B8%B0%20%EC%A0%84%EB%A7%9D:%202026%EB%85%84%20%EB%AF%B8%EA%B5%AD%20%EC%A4%91%EA%B0%84%EC%84%A0%EA%B1%B0%20%EA%B2%B0%EA%B3%BC%EC%99%80%20%EB%8C%80%EB%AF%B8%20%EC%9D%98%ED%9A%8C%EC%99%B8%EA%B5%90%20%EA%B0%95%ED%99%94%20%EB%93%B1%20%EC%A0%95%EC%B1%85%EC%A0%81%20%ED%95%A8%EC%9D%98.pdf", "VIEWER_URL": "http://drm.nars.go.kr:7003/sd/imageviewer?DocId=1Q8GqL7SYg9&ViewerYn=Y&EdmUserId=datauser&type=S&fileName=KOydtOyKiOyZgOuFvOygkC0yMDI2MTEyNinqsbDrtoDqtozqs7wg6rKs7KCcIOyCrOydtCwg7Yq465%2B87ZSEIO2Wieygleu2gCDtm4TrsJjquLAg7KCE66edOiAyMDI264WEIOuvuOq1rSDspJHqsITshKDqsbAg6rKw6rO87JmAIOuMgOuvuCDsnZjtmozsmbjqtZAg6rCV7ZmUIOuTsSDsoJXssYXsoIEg7ZWo7J2YLnBkZg%3D%3D", "DIV_NM": "이슈와 논점", "DIV_CD": "201010000", "BOOK_NM": "거부권과 견제 사이, 트럼프 행정부 후반기 전망: 2026년 미국 중간선거 결과와 대미 의회외교 강화 등 정책적 함의", "INSERT_DT": "2026-11-26"}, {"DATA_ID": "BDM00000018497", "PDF_FILE_NM": "(NARS 브리프 185호-20261123)국회입법조사처·한국정당학회·한국선거학회 공동 세미나 - 국회의원 선거제도와 정당공천 개혁방향.pdf", "PDF_FILE_URL": "http://www.nars.go.kr/fileDownload2.do?doc_id=1Q7s-FwM1Og&fileName=(NARS%20%EB%B8%8C%EB%A6%AC%ED%94%84%20185%ED%98%B8-20261123)%EA%B5%AD%ED%9A%8C%EC%9E%85%EB%B2%95%EC%A1%B0%EC%82%AC%EC%B2%98%C2%B7%ED%95%9C%EA%B5%AD%EC%A0%95%EB%8B%B9%ED%95%99%ED%9A%8C%C2%B7%ED%95%9C%EA%B5%AD%EC%84%A0%EA%B1%B0%ED%95%99%ED%9A%8C%20%EA%B3%B5%EB%8F%99%20%EC%84%B8%EB%AF%B8%EB%82%98%20-%20%EA%B5%AD%ED%9A%8C%EC%9D%98%EC%9B%90%20%EC%84%A0%EA%B1%B0%EC%A0%9C%EB%8F%84%EC%99%80%20%EC%A0%95%EB%8B%B9%EA%B3%B5%EC%B2%9C%20%EA%B0%9C%ED%98%81%EB%B0%A9%ED%96%A5.pdf", "VIEWER_URL": "http://drm.nars.go.kr:7003/sd/imageviewer?DocId=1Q7s-FwM1Og&ViewerYn=Y&EdmUserId=datauser&type=S&fileName=KE5BUlMg67iM66as7ZSEIDE4Ne2YuC0yMDI2MTEyMynqta3tmozsnoXrspXsobDsgqzsspjCt%2B2VnOq1reygleuLue2Vme2ajMK37ZWc6rWt7ISg6rGw7ZWZ7ZqMIOqzteuPmSDshLjrr7jrgpggLSDqta3tmozsnZjsm5Ag7ISg6rGw7KCc64%2BE7JmAIOygleuLueqzteyynCDqsJztmIHrsKntlqUucGRm", "DIV_NM": "NARS 브리프", "DIV_CD": "201190000", "BOOK_NM": "국회입법조사처·한국정당학회·한국선거학회 공동 세미나 - 국회의원 선거제도와 정당공천 개혁방향", "INSERT_DT": "2026-11-20"}, {"DATA_ID": "BDM00000018403", "PDF_FILE_NM": "(이슈와논점 2516호-20260721)511명의 무투표당선, 지방선거는 경쟁하고 있는가? - 3인 이상 선거구로 확산된 무투표당선과 지방선거 경쟁구조의 과제 -.pdf", "PDF_FILE_URL": "http://www.nars.go.kr/fileDownload2.do?doc_id=1P_18HtQnUK&fileName=(%EC%9D%B4%EC%8A%88%EC%99%80%EB%85%BC%EC%A0%90%202516%ED%98%B8-20260721)511%EB%AA%85%EC%9D%98%20%EB%AC%B4%ED%88%AC%ED%91%9C%EB%8B%B9%EC%84%A0,%20%EC%A7%80%EB%B0%A9%EC%84%A0%EA%B1%B0%EB%8A%94%20%EA%B2%BD%EC%9F%81%ED%95%98%EA%B3%A0%20%EC%9E%88%EB%8A%94%EA%B0%80?%20-%203%EC%9D%B8%20%EC%9D%B4%EC%83%81%20%EC%84%A0%EA%B1%B0%EA%B5%AC%EB%A1%9C%20%ED%99%95%EC%82%B0%EB%90%9C%20%EB%AC%B4%ED%88%AC%ED%91%9C%EB%8B%B9%EC%84%A0%EA%B3%BC%20%EC%A7%80%EB%B0%A9%EC%84%A0%EA%B1%B0%20%EA%B2%BD%EC%9F%81%EA%B5%AC%EC%A1%B0%EC%9D%98%20%EA%B3%BC%EC%A0%9C%20-.pdf", "VIEWER_URL": "http://drm.nars.go.kr:7003/sd/imageviewer?DocId=1P_18HtQnUK&ViewerYn=Y&EdmUserId=datauser&type=S&fileName=KOydtOyKiOyZgOuFvOygkCAyNTE27Zi4LTIwMjYwNzIxKTUxMeuqheydmCDrrLTtiKztkZzri7nshKAsIOyngOuwqeyEoOqxsOuKlCDqsr3sn4HtlZjqs6Ag7J6I64qU6rCAPyAtIDPsnbgg7J207IOBIOyEoOqxsOq1rOuhnCDtmZXsgrDrkJwg66y07Yis7ZGc64u57ISg6rO8IOyngOuwqeyEoOqxsCDqsr3sn4HqtazsobDsnZgg6rO87KCcIC0ucGRm", "DIV_NM": "이슈와 논점", "DIV_CD": "201010000", "BOOK_NM": "511명의 무투표당선, 지방선거는 경쟁하고 있는가? - 3인 이상 선거구로 확산된 무투표당선과 지방선거 경쟁구조의 과제 -", "INSERT_DT": "2026-07-21"}], "acrc": [{"incdntNo": "202500966", "cmtNm": "경기도행정심판위원회", "redcYmd": "2025-10-13", "chgDt": "2025-11-19", "clmeNm": "성남시", "clmIncdntNm": "수의계약 배제처분 취소청구", "docRlsYn": "Y", "adjdcResultNm": "각하", "parentCdNm": "기타", "rel": "【행정심판법】\n제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.\n【지방자치단체를 당사자로 하는 계약에 관한 법률】\n제9조(계약의 방법) ① 지방자치단체의 장 또는 계약담당자는 계약을 체결하려는 경우에는 이를 공고하여 일반입찰에 부쳐야 한다. 다만, 계약의 목적ㆍ성질ㆍ규모 및 지역특수성 등을 고려하여 필요하다고 인정되면 참가자를 지명(指名)하여 입찰에\n【지방자치단체를 당사자로 하는 계약에 관한 법률 시행령】\n제10조(예정가격의 결정기준) ① 지방자치단체의 장 또는 계약담당자는 다음 각 호의 가격을 기준으로 하여 예정가격을 결정하여야 한다. \n【지방자치단체를 당사자로 하는 계약에 관한 법률 시행규칙】\n제75조(지연배상금률) 영 제90조제1항에 따른 지연배상금률은 다음 각 호와 같다."}, {"incdntNo": "202500932", "cmtNm": "경기도행정심판위원회", "redcYmd": "2025-10-13", "chgDt": "2026-01-12", "clmeNm": "광주시", "clmIncdntNm": "수도공급 거부처분 등 취소청구", "docRlsYn": "Y", "adjdcResultNm": "일부기각", "parentCdNm": "환경", "rel": "【수도법】\n제38조(공급규정) ①일반수도사업자는 대통령령으로 정하는 바에 따라 수돗물의 요금, 급수설비에 관한 공사의 비용부담, 그 밖에 수돗물의 공급 조건에 관한 규정을 정하여 수돗물의 공급을 시작하기 전까지 인가관청의 승인을 받아야 하고, 승인을 받은 사항을 변경하려는 경우에도 또한\n【수도법 시행령】\n제53조의3(수돗물의 공급 거절) 법 제39조제1항에 따라 일반수도사업자는 수돗물의 공급을 원하는 자에게 다음 각 호의 어느 하나에 해당하는 경우 외에는 그 공급을 거절해서는 아니 된다.\n【○○시 수도 급수 조례】\n제2조(정의) 이 조례에서 사용하는 용어의 뜻은 다음 각 호와 같다.\n【신탁법】\n제22조(강제집행 등의 금지) ① 신탁재산에 대하여는 강제집행, 담보권 실행 등을 위한 경매, 보전처분(이하 “강제집행등”이라 한다) 또는 국세 등 체납처분을 할 수 없다. 다만, 신탁 전의 원인으로 발생한 권리 또는 신탁사무의 처리상 발생한 권리에 기한 경우에는 그러하지 아\n【지방자치법】\n제156조(사용료의 징수조례 등) ① 사용료ㆍ수수료 또는 분담금의 징수에 관한 사항은 조례로 정한다. 다만, 국가가 지방자치단체나 그 기관에 위임한 사무와 자치사무의 수수료 중 전국적으로 통일할 필요가 있는 수수료는 다른 법령의 규정에도 불구하고 대통령령으로 정하는 표준금\n【지방자치법】\n제153조(사용료) 지방자치단체는 공공시설의 이용 또는 재산의 사용에 대하여 사용료를 징수할 수 있다.\n【지방세기본법】\n제98조(다른 법률과의 관계) ① 이 법 또는 지방세관계법에 따른 이의신청의 대상이 되는 처분에 관한 사항에 관하여는 「행정심판법」을 적용하지 아니한다. 다만, 이의신청에 대해서는 같은 법 제15조, 제16조, 제20조부터 제22조까지, 제29조, 제36조제1항 및 제3\n【행정절차법】\n제21조(처분의 사전 통지) ① 행정청은 당사자에게 의무를 부과하거나 권익을 제한하는 처분을 하는 경우에는 미리 다음 각 호의 사항을 당사자등에게 통지하여야 한다.\n【행정심판법】\n제3조(행정심판의 대상) ① 행정청의 처분 또는 부작위에 대하여는 다른 법률에 특별한 규정이 있는 경우 외에는 이 법에 따라 행정심판을 청구할 수 있다."}, {"incdntNo": "202500232", "cmtNm": "경기도교육청행정심판위원회", "redcYmd": "2025-10-16", "chgDt": "2026-01-22", "clmeNm": "경기도광주하남교육지원청", "clmIncdntNm": "학교폭력 피해학생 재심 청구", "docRlsYn": "Y", "adjdcResultNm": "일부인용", "parentCdNm": "학교폭력", "rel": ""}], "body": {"dcsnOrdr": "이 사건 심판청구를 각하한다.", "clmIntn": "피청구인이 2025. 8. 1. 청구인에게 한 수의계약 배제 3개월의 처분을 취소한다.", "dcsnReason": "<![CDATA[<Text>1. 사건개요\n청구인은 ‘○○’의 대표자로서 피청구인이 소액수의견적 제출 안내 공고한 ‘2025년 ○○ 구입’ 물품계약의 수의계약 대상자로 선정되어 2025. 6. 26. 피청구인과 수의계약(계약금액 : ○○,○○○,○○○원, 납품기한 : 2025. 7. 9., 이하 ‘이 사건 계약’이라 한다)을 체결하였다.\n피청구인은 청구인이 납품기한까지 계약물품의 납품을 이행하지 않자 ｢지방자치단체를 당사자로 하는 계약에 관한 법률｣(이하 ‘지방계약법’이라 한다) 제30조, 같은 법 시행령 제90조 및 같은 법 시행규칙 제75조에 따라 2025. 7. 18., 같은 해 8. 1. 청구인에게 각 지연배상금 87,520원과 185,690원을 부과하고, 같은 날 청구인에게 ｢지방자치단체 입찰 및 계약집행기준｣에 따라 10일 이상 지연배상금 부과라는 수의계약 결격사유가 발생하여 청구인을 수의계약 배제업체로 지정(배제기간 : 2025. 8. 1. ~ 2025. 10. 31.)하였음을 통보(이하 ‘이 사건 통보’라 한다)하였다.\n2. 이 사건 심판청구의 적법 여부\n가. 관계법령\n【행정심판법】\n제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.\n<표 삽입을 위한 여백>\n      <Object Index=\"1\" Type=\"Table\">\n      <Text>나. 판  단\n1) 인정사실\n이 사건 청구서 및 답변서, 물품계약서, 지연배상금 부과 알림, 이 사건 통지서 등에 의하면 다음과 같은 사실이 인정된다.\n가) 청구인은 ‘○○’의 대표자로서 피청구인이 소액수의견적 제출 안내 공고한 ‘2025년 ○○ 구입’ 물품계약의 수의계약 대상자로 선정되어 2025. 6. 26. 피청구인과 이 사건 계약을 체결하였다.\n나) 피청구인은 청구인이 납품기한까지 계약물품의 납품을 이행하지 않자 지방계약법 제30조, 같은 법 시행령 제90조 및 같은 법 시행규칙 제75조에 따라 2025. 7. 18., 같은 해 8. 1. 청구인에게 각 지연배상금 87,520원과 185,690원을 부과하였다.\n다) 피청구인은 2025. 8. 1. 청구인에게 ｢지방자치단체 입찰 및 계약집행기준｣에 따라 10일 이상 지연배상금 부과라는 수의계약 결격사유가 발생하여 청구인을 수의계약 배제업체로 지정(배제기간 : 2025. 8. 1. ~ 2025. 10. 31.)하였음을 통보하였다.\n2) 지방계약법 제9조제1항 및 같은 법 시행령 제30조제1항에 따르면 지방자치단체의 장 또는 계약담당자는 계약을 체결하려는 경우에는 이를 공고하여 일반입찰에 부쳐야 하고 다만, 계약의 목적ㆍ성질ㆍ규모 및 지역특수성 등을 고려하여 필요하다고 인정되면 참가자를 지명(指名)하여 입찰에 부치거나 수의계약을 할 수 있고, 수의계약을 체결하려는 경우에는 2인 이상으로부터 견적서를 받아야 한다.\n한편, 지방계약법 제30조제1항에 따르면 지방자치단체의 장 또는 계약담당자는 정당한 사유 없이 계약의 이행을 지체한 계약상대자로 하여금 지연배상금을 내도록 하여야 한다.\n3) 이 사건 심판청구의 적법 여부\n청구인\n…\n정한 지방자치단체의 내부규정으로서(대법원 1996. 4. 26. 선고 95다11436 판결, 대법원 2001. 12. 11. 선고 2001다33604 판결 등 참조), 이 사건 통지는 ｢지방자치단체 입찰 및 계약 집행기준｣에 따라 수의계약대상자 자격이 제한되는 것과 그 기간을 확인하는 의미에서 한 사실상의 통보행위에 불과하고, 그 통보에 의하여 수의계약대상자 자격이 제한되는 청구인의 구체적 권리의무가 직접 변동되는 것은 아니며, 피청구인이나 다른 지방자치단체의 계약담당자가 수의계약 체결 과정에서 ｢지방자치단체 입찰 및 계약 집행기준｣상의 배제사유를 이유로 청구인과의 계약체결을 거절한다고 하더라도, 이는 이 사건 통지로 인하여 발생한 법률상 효과라기보다는 청구인이 ｢지방자치단체 입찰 및 계약 집행기준｣에서 정한 배제사유에 해당한다는 사정이 계약체결의 사유로 고려되는 사실상 또는 간접적인 효과에 불과하다고 할 수 있다(광주지방법원 2021. 5. 21. 선고 2020구합14243 판결 참조).\n따라서 이 사건 통지는 ｢행정심판법｣ 제2조 및 제3조에서 규정하는 행정심판의 대상인 ‘처분’에 해당하지 않는다고 봄이 타당하므로, 이 사건 청구는 심판청구 대상이 아닌 것에 대한 청구로서 부적법한 청구이다.\n3. 결  론\n그렇다면, 이 사건 심판청구는 심판청구요건을 갖추지 못한 부적법한 청구이므로 이를 각하하기로 하여 주문과 같이 재결한다.]]>", "hwpFileDownUrl": "<![CDATA[https://ino.simpan.go.kr/com/innorix/file/download.do?atchFileSn=14604755&atchFileDtlSn=1]]>"}};
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function fakeData(opts = {}) {
  const key = opts.key || 'fake-data-key', asked = opts.asked || [];
  const now = new Date(Date.now() + 9 * 3600e3), prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const statLatest = () => opts.statLatest || `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const res = (body, type = 'application/json;charset=UTF-8', url = '', status = 200) => { const r = new Response(body, { status, headers: { 'content-type': type } }); Object.defineProperty(r, 'url', { value: url }); return r; };
  const cc = (items, total, q) => JSON.stringify({ header: { resultCode: '0', resultMsg: 'NORMAL SERVICE' }, body: { items: items.length ? { item: items } : '', numOfRows: Number(q.get('numOfRows')) || 10, pageNo: Number(q.get('pageNo')) || 1, totalCount: total ?? items.length, type: 'json' } });
  const pageOf = (all, q, cap) => { const n = Math.min(Number(q.get('numOfRows')) || 10, cap || 1e9), p = Number(q.get('pageNo')) || 1; return all.slice((p - 1) * n, p * n); };
  let stat = null;
  const statRows = () => stat || (stat = [...SAMPLES.stat,
    { lawNm: '집회 및 시위에 관한 법률(2007. 5. 11. 법률 제8424호로 전부개정된 것) 제10조 중 “옥외집회” 부분', eventNo: '2008헌가25', rstaDate: '20090924', rstaRsta: '헌법불합치', precdntBook: '21-2상', precdntPage: '427' },
    ...Array.from({ length: 856 }, (_, i) => ({ lawNm: `${i % 2 ? '구 ' : ''}시험${i % 40}법(2010. 1. 1. 법률 제${10000 + i}호로 개정된 것) 제${(i % 50) + 1}조 제${(i % 3) + 1}항`, eventNo: `20${10 + (i % 15)}헌바${i + 1}`, rstaDate: `20${10 + (i % 15)}0${(i % 9) + 1}15`, rstaRsta: ['위헌', '헌법불합치', '한정위헌'][i % 3], precdntBook: '', precdntPage: null }))]);
  const acrcRows = (ym) => {
    if (ym === '2025-10' && !opts.acrcCount) return SAMPLES.acrc;
    const n = opts.acrcCount ? opts.acrcCount(ym) : 3;
    return Array.from({ length: n }, (_, i) => ({ incdntNo: ym.replace('-', '') + String(i + 1).padStart(4, '0'), cmtNm: i % 2 ? '중앙행정심판위원회' : '서울특별시행정심판위원회', redcYmd: `${ym}-${String((i % 28) + 1).padStart(2, '0')}`, chgDt: `${ym}-28`, clmeNm: i % 3 ? '서울특별시장' : '국세청장', clmIncdntNm: `${['영업정지처분 취소청구', '정보공개 거부처분 취소청구', '운전면허 취소처분 취소청구'][i % 3]} ${ym} ${i + 1}`, docRlsYn: 'Y', adjdcResultNm: ['기각', '인용', '각하', '일부인용'][i % 4], parentCdNm: ['영업', '정보공개', '운전면허'][i % 3], rel: `【행정심판법】\n제3조(행정심판의 대상) …\n【${['식품위생법', '공공기관의 정보공개에 관한 법률', '도로교통법'][i % 3]}】\n제1조(목적) …` }));
  };
  const acrcItem = (x) => `<item>\n<incdntNo>${x.incdntNo}</incdntNo>\n<clmeUpinstCd/>\n<parentCdNm>${xmlEsc(x.parentCdNm)}</parentCdNm>\n<relSttDeidntfCn>${xmlEsc(x.rel)}</relSttDeidntfCn>\n<cmtNm>${xmlEsc(x.cmtNm)}</cmtNm>\n<redcYmd>${x.redcYmd}</redcYmd>\n<chgDt>${x.chgDt}</chgDt>\n<clmeNm>${xmlEsc(x.clmeNm)}</clmeNm>\n<clmIncdntNm>${xmlEsc(x.clmIncdntNm)}</clmIncdntNm>\n<docRlsYn>${x.docRlsYn}</docRlsYn>\n<adjdcResultNm>${xmlEsc(x.adjdcResultNm)}</adjdcResultNm>\n</item>\n`;
  const acrcXml = (code, msg, items, total, q) => `<?xml version="1.0" encoding="UTF-8"?><response>\n<header>\n<resultCode>${code}</resultCode>\n<resultMsg>${msg}</resultMsg>\n</header>\n<body>\n${items.length ? `<items>\n${items.map(acrcItem).join('')}</items>\n` : ''}<totalCount>${total}</totalCount>\n<pageNo>${q.get('pageNo') || 0}</pageNo>\n<numOfRows>${q.get('numOfRows') || 0}</numOfRows>\n<dataType>XML</dataType>\n</body>\n</response>\n`;
  // one 재결 whole, about 4 MB as the service gives it: its text, then a picture of its table in base64 (sent in pieces)
  const acrcBody = (no) => {
    const x = acrcRows(no.slice(0, 4) + '-' + no.slice(4, 6)).find((r) => r.incdntNo === no) || SAMPLES.acrc.find((r) => r.incdntNo === no);
    if (!x) return acrcXml('200', 'OK', [], 0, new URLSearchParams());
    const b = SAMPLES.body, pic = 'Qk1KqC4AAAAAAIoAAAB8' + '/'.repeat(3.9 * 1024 * 1024);
    const head = `<?xml version="1.0" encoding="UTF-8"?><response>\n<header>\n<resultCode>200</resultCode>\n<resultMsg>OK</resultMsg>\n</header>\n<body>\n<items>\n<item>\n<incdntNo>${no}</incdntNo>\n<dcsnOrdr>${b.dcsnOrdr}</dcsnOrdr>\n<parentCdNm>${xmlEsc(x.parentCdNm)}</parentCdNm>\n<relSttDeidntfCn>${xmlEsc(x.rel)}</relSttDeidntfCn>\n<cmtNm>${xmlEsc(x.cmtNm)}</cmtNm>\n<redcYmd>${x.redcYmd}</redcYmd>\n<clmeNm>${xmlEsc(x.clmeNm)}</clmeNm>\n<clmIntn>${b.clmIntn}</clmIntn>\n<clmIncdntNm>${xmlEsc(x.clmIncdntNm)}</clmIncdntNm>\n<dcsnReason>${b.dcsnReason}</dcsnReason>\n<hwpFileDownUrl>${b.hwpFileDownUrl}</hwpFileDownUrl>\n<adjdcResultNm>${xmlEsc(x.adjdcResultNm)}</adjdcResultNm>\n<object><![CDATA[<Image Encoding="Base64" Formats="png" Index="1" Size="3057738" Source="Table">`;
    const bytes = Buffer.from(head + pic + ']]></object>\n</item>\n</items>\n<totalCount>1</totalCount>\n</body>\n</response>\n');
    const cut = 65521;   // (pieces that end anywhere: inside a Hangul letter, inside <object>)
    return new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += cut) c.enqueue(new Uint8Array(bytes.subarray(i, i + cut))); c.close(); } });
  };
  const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60000, 32)]);
  return (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'www.nars.go.kr' && url.pathname === '/fileDownload2.do') {
      asked.push(url.href);
      if (url.protocol === 'https:' && opts.narsHttps === false) return Promise.reject(new TypeError('fetch failed'));
      return Promise.resolve(res(PDF, 'application/x-msdownload;charset=UTF-8', url.href));
    }
    if (url.hostname !== 'apis.data.go.kr') return null;
    asked.push(url.href);
    const q = url.searchParams, path = url.pathname.slice(1);
    if (q.get('serviceKey') !== key) return Promise.resolve(res('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>', 'text/xml'));
    const ok = (body, type) => Promise.resolve(res(body, type, url.href));
    const [org, svc, op] = path.split('/');
    if (org === '9750000' && svc === 'SentenceCaseService') {
      if (op === 'getSentenceSchduleList') return ok(cc(SAMPLES.sched[q.get('year') + q.get('month')] || [], undefined, q));
      if (op === 'getSentenceList') return ok(cc(SAMPLES.day[q.get('adjudgeDateTime')] || [], undefined, q));
      if (op === 'getRecentMainDecsnList') return ok(cc((Number(q.get('pageNo')) || 1) === 1 ? SAMPLES.recent : [], 3288, q));
      if (op === 'getDecsnOutlineDetail') return ok(cc(SAMPLES.outline[q.get('seqNo')] ? [SAMPLES.outline[q.get('seqNo')]] : [], undefined, q));
    }
    if (org === '9750000' && svc === 'DiscussCaseService') {
      if (op === 'getMainDscsSchduleList') return ok(cc((Number(q.get('pageNo')) || 1) === 1 ? SAMPLES.hearings : [], 287, q));
      if (op === 'getMainDscsSchduleDetail') return ok(cc(SAMPLES.hearing[q.get('eventNo')] || [], undefined, q));
      if (op === 'getDscsSchdulList') return ok(cc(SAMPLES.dscs[q.get('year') + q.get('month')] || [], undefined, q));
    }
    if (org === '9750000' && svc === 'CourtStatisticsService' && op === 'getVioconstitDecsnLawSttus') {
      if (`${q.get('year')}-${q.get('month')}` > statLatest()) return ok(cc([], 0, q));
      const all = statRows();
      return ok(cc(pageOf(all, q, opts.statCap), all.length, q));
    }
    if (org === '9750000' && svc === 'UnamLegStatService') {
      const all = op === 'getCnstitDscrdRefreeeIncdnt' ? SAMPLES.unamCnstit : op === 'getVioconstitQotatDecsnRefreeeIncdnt' ? SAMPLES.unamVio : null;
      if (all) return ok(cc(pageOf(all, q), all.length, q));
    }
    if (org === '9735000' && svc === 'PublicationService' && op === 'getResearchReportList') {
      const all = SAMPLES.nars.filter((x) => (!q.get('book_nm') || x.BOOK_NM.includes(q.get('book_nm'))) && (!q.get('div_cd') || x.DIV_CD === q.get('div_cd')));
      return ok(JSON.stringify({ getResearchReportList: { header: { code: '00', message: 'NORMAL SERVIE' }, item: pageOf(all, q), rows: null, numOfRows: Number(q.get('numOfRows')) || 10, pageNo: Number(q.get('pageNo')) || 1, totalCount: all.length, cdataYn: null } }));
    }
    if (org === '1140100' && svc === 'data' && op === 'adjdctexeList') {
      const s = q.get('adjdcStartDe') || '', e = q.get('adjdcEndDe') || '';
      const days = (Date.parse(`${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6)}`) - Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`)) / 864e5;
      if (!(days >= 0 && days <= 31)) return ok(acrcXml('100', '잘못된 요청 파라미터 에러', [], 0, new URLSearchParams()), 'text/xml;charset=UTF-8');
      const ym = `${s.slice(0, 4)}-${s.slice(4, 6)}`;
      if (opts.acrcFail && opts.acrcFail(ym, Number(q.get('pageNo')) || 1)) return Promise.resolve(res('<html><body>Service Unavailable</body></html>', 'text/html', url.href, 503));
      const all = acrcRows(ym).filter((x) => x.redcYmd.replace(/-/g, '') <= e);
      return ok(acrcXml('200', 'OK', pageOf(all, q, opts.acrcCap), all.length, q), 'text/xml;charset=UTF-8');
    }
    if (org === '1140100' && svc === 'data' && op === 'adjdctexe') return ok(acrcBody(q.get('incdntNo') || ''), 'text/xml;charset=UTF-8');
    return ok(JSON.stringify({ header: { resultCode: '99', resultMsg: 'fake: no such service' } }));
  };
}

export function serve(port, env) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = 'http://' + req.headers.host + req.url;
      if (req.url.startsWith('/__scheduled')) {   // (as wrangler dev has it) run the cron once now: GET /__scheduled[?time=<ms>]
        const t = Number(new URL(url).searchParams.get('time')) || Date.now(), pending = [];
        await worker.scheduled({ scheduledTime: t, cron: '17 * * * *' }, env, { waitUntil: (p) => pending.push(p) });
        await Promise.allSettled(pending);
        const st = await env.BUCKET.get('cron/state.json');
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(st ? await st.text() : '{}');
        return;
      }
      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const request = new Request(url, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
      const pending = [];
      const r = await worker.fetch(request, env, { waitUntil: (p) => pending.push(p) });
      // like Cloudflare, read away a body the worker did not want (an early refusal), so the connection stays usable
      if (hasBody && !request.bodyUsed) { try { await request.arrayBuffer(); } catch (e) { /* already gone */ } }
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(r.status, headers);
      if (r.body && req.method !== 'HEAD') { for await (const chunk of r.body) res.write(chunk); }
      res.end();
      await Promise.allSettled(pending);
    } catch (e) { console.error(e); try { res.writeHead(500); res.end('mock error'); } catch {} }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && process.argv[1].endsWith('mock.mjs')) {
  const [port, dir, origins, pepper, pinHash] = process.argv.slice(2);
  const env = { BUCKET: new MockR2(dir), ALLOWED_ORIGINS: origins, PEPPER: pepper, PIN_HASH: pinHash };
  if (process.env.SHELF_FAKE_DATA === '1') {   // the 7차 b services stood in for (fakeData above), so the app can be tried offline
    env.DATA_GO_KR_KEY = 'fake-data-key';
    // and nothing else outside is asked: every other outside address answers 503 (offline), local ones go through
    const fake = fakeData({ key: env.DATA_GO_KR_KEY }), realFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => fake(input, init) || (/^https?:\/\/(?:127\.0\.0\.1|localhost)[:/]/.test(String(typeof input === 'string' ? input : input.url)) ? realFetch(input, init)
      : Promise.resolve(new Response('offline (mock)', { status: 503 })));
  }
  serve(Number(port), env).then(() => console.log('mock 서재 server on', port));
}
