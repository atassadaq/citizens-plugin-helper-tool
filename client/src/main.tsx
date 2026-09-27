import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FavoritesProvider } from "./favorites/FavoritesContext";
import { ToastProvider } from "./ui/Toasts";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <FavoritesProvider>
        <App />
      </FavoritesProvider>
    </ToastProvider>
  </React.StrictMode>,
);
