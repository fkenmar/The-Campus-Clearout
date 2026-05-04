<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

$conn->query("ALTER TABLE listings ADD COLUMN tags TEXT DEFAULT NULL");

$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();

$data = json_decode(file_get_contents("php://input"), true);
$listing_id = $data["listing_id"] ?? null;
$course_tag = trim($data["course_tag"] ?? "");
$classMaterialsPrefix = "Class Materials:";

if (!$listing_id) {
    http_response_code(400);
    echo json_encode(["message" => "listing_id is required"]);
    exit;
}

if ($course_tag !== "" && strpos($course_tag, $classMaterialsPrefix) !== 0) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid course tag"]);
    exit;
}

$checkStmt = $conn->prepare("SELECT tags FROM listings WHERE id = ? AND username = ?");
$checkStmt->bind_param("is", $listing_id, $username);
$checkStmt->execute();
$checkResult = $checkStmt->get_result();

if ($checkResult->num_rows === 0) {
    http_response_code(403);
    echo json_encode(["message" => "Listing not found or you do not own this listing"]);
    exit;
}

$existingTags = $checkResult->fetch_assoc()["tags"] ?? "";
$checkStmt->close();

$tags = array_filter(array_map("trim", explode(",", $existingTags)), function ($tag) use ($classMaterialsPrefix) {
    return $tag !== "" && strpos($tag, $classMaterialsPrefix) !== 0;
});

if ($course_tag !== "") {
    $tags[] = $course_tag;
}

$updatedTags = implode(",", $tags);

$updateStmt = $conn->prepare("UPDATE listings SET tags = ? WHERE id = ? AND username = ?");
$updateStmt->bind_param("sis", $updatedTags, $listing_id, $username);

if ($updateStmt->execute()) {
    echo json_encode([
        "message" => "Course updated successfully",
        "tags" => $updatedTags,
    ]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to update course"]);
}

$updateStmt->close();
$conn->close();
?>
