<?php
mysqli_report(MYSQLI_REPORT_OFF);

$host = "localhost";
$db   = "cse442_2026_spring_team_s_db";
$user = "kenmarfr";
$pass = "";

$conn = new mysqli($host, $user, $pass, $db);
