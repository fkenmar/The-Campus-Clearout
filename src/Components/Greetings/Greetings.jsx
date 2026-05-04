import React, { useState, useEffect } from "react";
import "./Greetings.css";

export default function Greetings() {
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    fetch("/CSE442/2026-Spring/cse-442s/api/greetings.php")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Welcome to Campus Clearout!"));
  }, []);

  return (
    <div className="greetings-container">
      <h1 className="greetings-title">{message}</h1>
    </div>
  );
}
