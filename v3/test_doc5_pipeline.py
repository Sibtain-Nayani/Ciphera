from feature12_hindi_support import HindiPipeline
p = HindiPipeline()
text = "नाम: राहुल शर्मा\nजन्म तिथि: 12.05.1990\nआधार: 9876 5432 1098\nफोन: 9876543210\nपैन कार्ड: ABCDE1234F"
res = p.run(text)
print(res)
