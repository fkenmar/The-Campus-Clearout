const e = React.createElement;

function Greetings() {
  const [message, setMessage] = React.useState("Loading...");

  React.useEffect(() => {
    fetch("./greetings.php")
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(() => setMessage("Welcome to Campus Clearout!"));
  }, []);

  return e("div", { style: { textAlign: "center" } },
    e("h1", { style: { color: "#ffffff", fontSize: "72px", fontFamily: "sans-serif", marginBottom: "10px" } }, message),
    e("p", { style: { color: "#A9D1C3", fontSize: "24px", fontFamily: "sans-serif" } }, "Your campus marketplace")
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(e(Greetings));
