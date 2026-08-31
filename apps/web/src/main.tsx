import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { syncFelt, syncMotionClass } from "./store/ui";
import "./index.css";

// Antes do primeiro render: a mesa não pode nascer se mexendo para quem pediu
// que ela não mexesse, nem verde para quem escolheu vinho.
syncMotionClass();
syncFelt();

// No StrictMode: its double-invoked effects would join and leave every room twice.
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <App />
  </QueryClientProvider>,
);
