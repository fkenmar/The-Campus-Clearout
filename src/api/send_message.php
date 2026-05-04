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

// Auth (UPDATED)
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare(
    "SELECT u.id, u.username
     FROM user_sessions s
     JOIN users u ON u.username = s.username
     WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())"
);

if (!$tokenStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$userRow = $tokenResult->fetch_assoc();
$me_id = (int)$userRow["id"];
$me_username = $userRow["username"];
$tokenStmt->close();

// Parse input
$chat_id = isset($_POST['chat_id']) ? intval($_POST['chat_id']) : 0;
$message = isset($_POST['message']) ? trim($_POST['message']) : "";

if ($chat_id < 1) {
    http_response_code(400);
    echo json_encode(["message" => "Valid chat_id is required"]);
    exit;
}

// Must have text or image
$hasImage = isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK;
if ($message === "" && !$hasImage) {
    http_response_code(400);
    echo json_encode(["message" => "Message or image is required"]);
    exit;
}

// Length check
const MAX_MESSAGE_LENGTH = 2000;
if (mb_strlen($message) > MAX_MESSAGE_LENGTH) {
    http_response_code(400);
    echo json_encode(["message" => "Message too long"]);
    exit;
}

// Image handling (unchanged)
function resizeAndSave($src, $dest, $maxDim = 1200, $quality = 82) {
    $info = @getimagesize($src);
    if (!$info) return false;
    [$w, $h, $type] = $info;

    switch ($type) {
        case IMAGETYPE_JPEG: $img = imagecreatefromjpeg($src); break;
        case IMAGETYPE_PNG:  $img = imagecreatefrompng($src); break;
        case IMAGETYPE_GIF:  $img = imagecreatefromgif($src); break;
        case IMAGETYPE_WEBP: $img = imagecreatefromwebp($src); break;
        default: return false;
    }

    if (!$img) return false;

    $ratio = ($w > $maxDim || $h > $maxDim) ? min($maxDim / $w, $maxDim / $h) : 1;
    $nw = max(1, (int)($w * $ratio));
    $nh = max(1, (int)($h * $ratio));

    $out = imagecreatetruecolor($nw, $nh);
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);

    $result = imagejpeg($out, $dest, $quality);

    imagedestroy($img);
    imagedestroy($out);

    return $result;
}

// Upload image
$image_url = null;

if ($hasImage) {
    $allowedExts = ['jpg','jpeg','png','gif','webp'];
    $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));

    if (!in_array($ext, $allowedExts)) {
        http_response_code(400);
        echo json_encode(["message" => "Invalid image type"]);
        exit;
    }

    if ($_FILES['image']['size'] > 5 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(["message" => "Image too large"]);
        exit;
    }

    $uploadDir = __DIR__ . "/../uploads/";
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $filename = "msg_" . bin2hex(random_bytes(16)) . ".jpg";

    if (resizeAndSave($_FILES['image']['tmp_name'], $uploadDir . $filename)) {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
        $image_url = $protocol . "://" . $_SERVER['HTTP_HOST'] . "/CSE442/2026-Spring/cse-442s/uploads/" . $filename;
    } else {
        http_response_code(500);
        echo json_encode(["message" => "Image processing failed"]);
        exit;
    }
}

// Verify chat membership (UPDATED → IDs)
$chatStmt = $conn->prepare(
    "SELECT id FROM chats WHERE id = ? AND (buyer_id = ? OR seller_id = ?)"
);

if (!$chatStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$chatStmt->bind_param("iii", $chat_id, $me_id, $me_id);
$chatStmt->execute();
$chatRow = $chatStmt->get_result()->fetch_assoc();
$chatStmt->close();

if (!$chatRow) {
    http_response_code(403);
    echo json_encode(["message" => "Chat not found or access denied"]);
    exit;
}

// Insert message (UPDATED → dual write)
$insertStmt = $conn->prepare(
    "INSERT INTO messages (chat_id, sender_username, sender_id, message, image_url)
     VALUES (?, ?, ?, ?, ?)"
);

if (!$insertStmt) {
    http_response_code(500);
    echo json_encode(["message" => "DB prepare failed: " . $conn->error]);
    exit;
}

$insertStmt->bind_param("isiss", $chat_id, $me_username, $me_id, $message, $image_url);

if (!$insertStmt->execute()) {
    http_response_code(500);
    echo json_encode(["message" => "Failed to send message"]);
    $insertStmt->close();
    exit;
}

$insertStmt->close();

http_response_code(201);
echo json_encode(["message" => "Message sent"]);

$conn->close();
?>