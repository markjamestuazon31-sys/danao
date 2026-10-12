import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LearningPreferencesProvider } from "./context/LearningPreferencesContext";
import { SchoolStructureProvider } from "./context/SchoolStructureContext";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./routes/ProtectedRoute";
import Home from "./pages/Home";
import Library from "./pages/Library";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CompleteProfile from "./pages/CompleteProfile";
import StudentDashboard from "./pages/StudentDashboard";
import StudentCatalogPage from "./pages/StudentCatalogPage";
import StudentProgress from "./pages/StudentProgress";
import StudentGrades from "./pages/StudentGrades";
import StudentQuizzes from "./pages/StudentQuizzes";
import StudentQuizTake from "./pages/StudentQuizTake";
import StudentAchievements from "./pages/StudentAchievements";
import StudentSearch from "./pages/StudentSearch";
import StudentProfile from "./pages/StudentProfile";
import StudentSettings from "./pages/StudentSettings";
import CameraMathGame from "./pages/CameraMathGame";
import CameraLearningCertificate from "./pages/CameraLearningCertificate";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherAttendance from "./pages/TeacherAttendance";
import TeacherStudents from "./pages/TeacherStudents";
import TeacherWorkspace from "./pages/TeacherWorkspace";
import TeacherGradebook from "./pages/TeacherGradebook";
import TeacherQuizBuilder from "./pages/TeacherQuizBuilder";
import TeacherQuizLibrary from "./pages/TeacherQuizLibrary";
import TeacherQuizResults from "./pages/TeacherQuizResults";
import TeacherCameraStudio from "./pages/TeacherCameraStudio";
import TeacherGameZone from "./pages/TeacherGameZone";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTeachers from "./pages/AdminTeachers";
import AdminStudents from "./pages/AdminStudents";
import AdminContent from "./pages/AdminContent";
import AdminReports from "./pages/AdminReports";
import AdminSettings from "./pages/AdminSettings";
import AdminSystem from "./pages/AdminSystem";
import AdminOperations from "./pages/AdminOperations";
import AIStudio from "./pages/AIStudio";
import LearningContentStudio from "./pages/LearningContentStudio";
import Analytics from "./pages/Analytics";
import LessonDetails from "./pages/LessonDetails";
import GamePage from "./pages/GamePage";
import "./styles/student-experience.css";
import "./styles/student-dashboard.css";
import "./styles/camera-math.css";
import "./styles/teacher-workspace.css";
import "./styles/teacher-camera-studio.css";
import "./styles/game-audio-upgrade.css";
import "./styles/assessment-suite.css";
import "./styles/attendance-tracker.css";
import "./styles/student-sidebar-redesign.css";
import "./styles/academic-structure.css";
import "./styles/learning-content-studio.css";
import "./styles/teacher-sidebar.css";
import "./styles/teacher-readable-type.css";
import "./styles/admin-readable-type.css";
import "./styles/content-delete.css";
import "./styles/teacher-simple-workflow.css";
import "./styles/math-lesson-studio.css";
import "./styles/admin-operations.css";
import "./styles/admin-sidebar.css";
import "./styles/admin-dashboard-redesign.css";
import "./styles/admin-action-center-redesign.css";

function protect(roles, element) {
  return <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <SchoolStructureProvider>
        <AuthProvider>
          <LearningPreferencesProvider>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/games" element={<Library gamesOnly />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />

              <Route path="/lesson/:id" element={protect(["student", "teacher", "admin"], <LessonDetails />)} />
              <Route path="/game/:id" element={protect(["student", "teacher", "admin"], <GamePage />)} />

              <Route path="/student/dashboard" element={protect(["student"], <StudentDashboard />)} />
              <Route path="/student/lessons" element={protect(["student"], <StudentCatalogPage type="lesson" />)} />
              <Route path="/student/games" element={protect(["student"], <StudentCatalogPage type="game" />)} />
              <Route path="/student/progress" element={protect(["student"], <StudentProgress />)} />
              <Route path="/student/grades" element={protect(["student"], <StudentGrades />)} />
              <Route path="/student/quizzes" element={protect(["student"], <StudentQuizzes />)} />
              <Route path="/student/quizzes/:quizId" element={protect(["student"], <StudentQuizTake />)} />
              <Route path="/student/achievements" element={protect(["student"], <StudentAchievements />)} />
              <Route path="/student/certificates" element={protect(["student"], <StudentAchievements />)} />
              <Route path="/student/profile" element={protect(["student"], <StudentProfile />)} />
              <Route path="/student/settings" element={protect(["student"], <StudentSettings />)} />
              <Route path="/student/camera-math" element={protect(["student"], <CameraMathGame initialActivity="math" />)} />
              <Route path="/student/camera-reading" element={protect(["student"], <CameraMathGame initialActivity="english" />)} />
              <Route path="/student/camera-reading-english" element={protect(["student"], <CameraMathGame initialActivity="english" />)} />
              <Route path="/student/camera-sort" element={protect(["student"], <CameraMathGame initialActivity="sort" />)} />
              <Route path="/student/camera-sentence" element={protect(["student"], <CameraMathGame initialActivity="sentence" />)} />
              <Route path="/student/camera-spelling" element={protect(["student"], <CameraMathGame initialActivity="spelling" />)} />
              <Route path="/student/camera-picture" element={protect(["student"], <CameraMathGame initialActivity="picture" />)} />
              <Route path="/student/camera-truefalse" element={protect(["student"], <CameraMathGame initialActivity="truefalse" />)} />
              <Route path="/student/camera-certificate/:track" element={protect(["student"], <CameraLearningCertificate />)} />
              <Route path="/student/search" element={protect(["student"], <StudentSearch />)} />

              <Route path="/teacher/dashboard" element={protect(["teacher"], <TeacherDashboard />)} />
              <Route path="/teacher/ai-studio" element={protect(["teacher"], <AIStudio />)} />
              <Route path="/teacher/content-studio" element={protect(["teacher"], <LearningContentStudio />)} />
              <Route path="/teacher/camera-content" element={protect(["teacher"], <TeacherCameraStudio />)} />
              <Route path="/teacher/game-zone" element={protect(["teacher"], <TeacherGameZone />)} />
              <Route path="/teacher/lessons" element={protect(["teacher"], <TeacherWorkspace view="lessons" />)} />
              <Route path="/teacher/students" element={protect(["teacher"], <TeacherStudents />)} />
              <Route path="/teacher/attendance" element={protect(["teacher"], <TeacherAttendance />)} />
              <Route path="/teacher/quizzes" element={protect(["teacher"], <TeacherQuizLibrary />)} />
              <Route path="/teacher/quizzes/new" element={protect(["teacher"], <TeacherQuizBuilder />)} />
              <Route path="/teacher/quizzes/:quizId/edit" element={protect(["teacher"], <TeacherQuizBuilder />)} />
              <Route path="/teacher/quizzes/:quizId/results" element={protect(["teacher"], <TeacherQuizResults />)} />
              <Route path="/teacher/grades" element={protect(["teacher"], <TeacherGradebook />)} />
              <Route path="/teacher/reports" element={protect(["teacher"], <TeacherWorkspace view="reports" />)} />

              <Route path="/admin/dashboard" element={protect(["admin"], <AdminDashboard />)} />
              <Route path="/admin/operations" element={protect(["admin"], <AdminOperations />)} />
              <Route path="/admin/teachers" element={protect(["admin"], <AdminTeachers />)} />
              <Route path="/admin/students" element={protect(["admin"], <AdminStudents />)} />
              <Route path="/admin/content" element={protect(["admin"], <AdminContent />)} />
              <Route path="/admin/analytics" element={protect(["admin"], <Analytics />)} />
              <Route path="/admin/reports" element={protect(["admin"], <AdminReports />)} />
              <Route path="/admin/settings" element={protect(["admin"], <AdminSettings />)} />
              <Route path="/admin/system" element={protect(["admin"], <AdminSystem />)} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </LearningPreferencesProvider>
        </AuthProvider>
      </SchoolStructureProvider>
    </BrowserRouter>
  );
}
