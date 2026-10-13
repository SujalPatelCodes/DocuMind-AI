import AppShell from "./components/AppShell";

/**
 * The dashboard IS the whole website: it fills the entire viewport with no
 * outer mockup frame. Layout, top to bottom:
 *   44px black navigation rail · 171px conversation sidebar · workspace
 * The inner columns use h-screen flex so internal panes scroll on their own.
 */
export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <AppShell />
    </div>
  );
}