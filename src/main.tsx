import React from "react";
import { createRoot } from "react-dom/client";
import GameTable from "./ui/GameTable";
import "./style.css";
createRoot(document.getElementById("root")!).render(<GameTable/>);
