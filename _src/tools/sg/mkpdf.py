# minimal multi-page PDF with extractable Latin text (for library/page-count/fallback tests)
import sys
def make(path, n, label):
    objs = {}
    font = 3
    kids = []
    nid = 4
    for k in range(1, n + 1):
        page, cont = nid, nid + 1; nid += 2
        text = f'{label} page {k}: the legislature must decide essential matters (p{k}).'
        stream = f'BT /F1 14 Tf 60 780 Td ({text}) Tj ET'.encode()
        objs[cont] = b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream'
        objs[page] = f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font} 0 R >> >> /Contents {cont} 0 R >>'.encode()
        kids.append(page)
    objs[1] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objs[2] = f'<< /Type /Pages /Kids [{" ".join(f"{k} 0 R" for k in kids)}] /Count {n} >>'.encode()
    objs[font] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    out = bytearray(b'%PDF-1.4\n'); offs = {}
    for i in sorted(objs):
        offs[i] = len(out); out += f'{i} 0 obj\n'.encode() + objs[i] + b'\nendobj\n'
    x = len(out); size = max(objs) + 1
    out += f'xref\n0 {size}\n0000000000 65535 f \n'.encode()
    for i in range(1, size): out += (f'{offs[i]:010d} 00000 n \n' if i in offs else '0000000000 65535 f \n').encode()
    out += f'trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    open(path, 'wb').write(out)
make(sys.argv[1], int(sys.argv[2]), sys.argv[3])
