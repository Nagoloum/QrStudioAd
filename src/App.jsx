import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./composants/ThemeContext";
import { ThemeToggle } from "./composants/QRApp";
import QRGeneratorPage from "./pages/Qrcode";
import Errorpage from "./pages/Errorpage";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ThemeToggle /> {/* fixed top-right button */}
        <Routes>
          <Route path="/" element={<QRGeneratorPage />} />
          <Route path="*" element={<Errorpage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}