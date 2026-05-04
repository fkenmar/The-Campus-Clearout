<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$host = "localhost";
$db   = "cse442_2026_spring_team_s_db";
$user = "kenmarfr";
$pass = "";

$conn = new mysqli($host, $user, $pass, $db);

if ($conn->connect_error) {
    echo json_encode(["message" => "Welcome to Campus Clearout!"]);
    exit;
}

$result = $conn->query("SELECT message FROM greetings LIMIT 1");

if ($result && $row = $result->fetch_assoc()) {
    echo json_encode(["message" => $row["message"]]);
} else {
    echo json_encode(["message" => "Welcome to Campus Clearout!"]);
}

$conn->close();
?>
