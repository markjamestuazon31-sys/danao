
// Add import
import { getGameById } from "../services/dataService";

// Add state
const [lessonQuizGame, setLessonQuizGame] = useState(null);
const [quizStarted, setQuizStarted] = useState(false);

// Load teacher-created quiz game
useEffect(() => {
  async function loadTeacherQuiz() {
    const gameId =
      normalizedLesson?.gameId ||
      normalizedLesson?.connectedGameId;

    if (!gameId) {
      setLessonQuizGame(null);
      return;
    }

    const game = await getGameById(gameId);
    setLessonQuizGame(game);
  }

  loadTeacherQuiz();
}, [normalizedLesson]);

// Replace quizQuestions calculation
const quizQuestions = useMemo(() => {
  if (lessonQuizGame?.questions) {
    return lessonQuizGame.questions;
  }

  return normalizedLesson?.quizQuestions ||
    normalizedLesson?.quiz ||
    normalizedLesson?.questions ||
    [];
}, [normalizedLesson, lessonQuizGame]);

// Quiz gateway before actual quiz
/*
Render:

if (!quizStarted)
 show:
 "Lesson completed"
 "Ready for teacher quiz"
 button -> setQuizStarted(true)

then display existing lesson-quiz form.
*/
