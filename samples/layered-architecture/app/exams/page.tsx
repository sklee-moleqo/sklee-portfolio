import { ExamListView } from '../../sections/exam/exam-list-view.js'

// Route Layer: URL과 화면을 잇기만 한다. API 호출·비즈니스 로직·복잡한 상태를 두지 않는다.
export default function ExamsPage() {
  return <ExamListView />
}
