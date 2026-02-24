import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { useSimpleChromeExtension } from "./hooks";
import "./App.css";

function App() {
  const { isImagesFound, downloadAllImages } = useSimpleChromeExtension();

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React (extension)</h1>
      <div className="card">
        {isImagesFound ? (
          <button onClick={downloadAllImages}>Download images</button>
        ) : (
          <h2>No images found</h2>
        )}
      </div>
    </>
  );
}

export default App;
