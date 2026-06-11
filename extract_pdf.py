from pypdf import PdfReader
r = PdfReader(r"C:\Users\Admin\.claude\projects\d--test-my-novel\c527492d-ba11-493c-bf46-393b7e24ba47\tool-results\webfetch-1781066412883-m533pz.pdf")
text = "\n".join(p.extract_text() or "" for p in r.pages)
open(r"D:\test\my_novel\paper_2511_10652.txt", "w", encoding="utf-8").write(text)
print(len(text), "chars,", len(r.pages), "pages")
