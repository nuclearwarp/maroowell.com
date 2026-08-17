from pathlib import Path

path = Path('public/maroowell_schedule')
text = path.read_text(encoding='utf-8')

old = '''      function childScheduleExistsInCurrentWeek(parent){
        if(!parent || !Array.isArray(parent.children) || !parent.children.length) return false;
        for(const child of parent.children){
          for(const date of state.weekDates){
            if(compact(valueForCell(date,child.label))) return true;
          }
        }
        return false;
      }
'''

new = '''      function childScheduleExistsInCurrentWeek(parent){
        if(!parent || !Array.isArray(parent.children) || !parent.children.length) return false;

        // 부모 라우트에 직접 배정된 날짜는 "미분할" 상태다.
        // 과거 서서브 데이터가 남아 있어도 그 날짜 때문에 자동 펼침되면 안 된다.
        for(const date of state.weekDates){
          if(compact(valueForCell(date,parent.label))) continue;
          for(const child of parent.children){
            if(compact(valueForCell(date,child.label))) return true;
          }
        }
        return false;
      }
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f'childScheduleExistsInCurrentWeek anchor count={count}')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

final = path.read_text(encoding='utf-8')
if 'if(compact(valueForCell(date,parent.label))) continue;' not in final:
    raise SystemExit('parent precedence validation failed')
