"""V75.8: match legitimate apartment complex names lacking the word 'apartment'.
'Worldcup Park 7th complex', for example, is named as a complex ('danji').
Do not match arbitrary place names; downstream parcel/address matching is still mandatory.
"""
from pathlib import Path
import re,sys,hashlib
MARKER='V758_KAPT_COMPLEX_NAME_CANDIDATES'
PRIOR_MARKER='V757_KAPT_LIVE_V4_V5_ENDPOINTS'
OLD='if (/아파트|주상복합|오피스텔/.test(name.replace(/\\s+/g, ""))) pushName(regionKey, name);'
NEW='if (/아파트|주상복합|오피스텔|월드컵파크|[0-9]{1,2}단지|래미안|푸르지오|힐스테이트|아이파크|자이/.test(name.replace(/\\s+/g, ""))) pushName(regionKey, name);'
def patch(source):
    if MARKER in source:return source
    if PRIOR_MARKER not in source:raise ValueError('V75.7 worker required')
    if source.count(OLD)!=1:raise ValueError('K-APT candidate exact source not matched; manual review')
    return source.replace(OLD,NEW,1).rstrip()+'\n\n// '+MARKER+'\n'
if __name__=='__main__':
    src=Path(sys.argv[1]).read_text(encoding='utf-8')
    out=patch(src)
    Path(sys.argv[2]).write_text(out,encoding='utf-8')
    print(hashlib.sha256(out.encode()).hexdigest())
