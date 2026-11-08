// Per-page token for public sharing previews/downloads.
// A newer operation, a selection change, or a failed operation invalidates older
// asynchronous work before it can download, replace the preview or overwrite the
// current report.
export function createShareGate(){
  let current=0,invalidatedBy='init';
  return {
    begin(){current+=1;invalidatedBy='operation';return current;},
    invalidate(reason='selection'){current+=1;invalidatedBy=reason;},
    isCurrent(token){return token===current;},
    get current(){return current;},
    get invalidatedBy(){return invalidatedBy;},
  };
}
