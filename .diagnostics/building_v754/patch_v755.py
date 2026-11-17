"""V75.5 fix for provably duplicated exclusive-source buckets."""
from pathlib import Path
import re,sys,hashlib
HERE=Path(__file__).parent
MARKER='V755_EXCLUSIVE_BUCKET_DEDUPE'

def patch(source):
    if MARKER in source:
        return source
    if "buildingTransportPolicy: 'SHARED_SERIAL_PACED_V75_4'" not in source:
        raise ValueError("Expected audited V75.4 backend; refusing to change another worker")
    start=source.find('const aggregate = v60AggregateBuildingStats({')
    if start<0: raise ValueError("Missing V60 aggregation call")
    anchor='if (aggregate.deliveryUnitCount <= 0) {'
    at=source.find(anchor,start)
    if at<0 or at-start>9000:
        raise ValueError("Unexpected aggregation completion boundary")
    if source.count(anchor)!=1:
        raise ValueError("Ambiguous aggregation boundary; requires manual source review")
    helper=(HERE/'reconcile_v755.js').read_text(encoding='utf-8')
    insertion='// '+MARKER+'\n  v755ReconcileExclusiveBuckets(aggregate);\n  '
    source=source[:at]+insertion+source[at:]
    return source.rstrip()+'\n\n'+helper+'\n'

if __name__=='__main__':
    path=Path(sys.argv[1])
    new=patch(path.read_text(encoding='utf-8'))
    Path(sys.argv[2]).write_text(new,encoding='utf-8')
    print(hashlib.sha256(new.encode('utf-8')).hexdigest())
