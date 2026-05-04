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

// Add columns if they don't exist yet
$conn->query("ALTER TABLE listings ADD COLUMN description TEXT DEFAULT NULL");
$conn->query("ALTER TABLE listings ADD COLUMN tags TEXT DEFAULT NULL");
$conn->query("ALTER TABLE user_sessions ADD COLUMN expires_at DATETIME DEFAULT NULL");
$conn->query("ALTER TABLE listings ADD COLUMN quantity INT NOT NULL DEFAULT 1");

// Validate token from Authorization header
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

$title       = $_POST["title"]       ?? "";
$price       = $_POST["price"]       ?? "";
$quantity    = $_POST["quantity"]    ?? 1;
$description = $_POST["description"] ?? "";
$tags        = $_POST["tags"]        ?? null;

$quantity = (int)$quantity;
if ($quantity < 1) {
    http_response_code(400);
    echo json_encode(["message" => "Quantity must be at least 1"]);
    exit;
}

if (!$title || $price === "") {
    http_response_code(400);
    echo json_encode(["message" => "Title and price are required"]);
    exit;
}

if (!isset($_FILES["images"]) || count($_FILES["images"]["name"]) === 0) {
    http_response_code(400);
    echo json_encode(["message" => "At least one image is required"]);
    exit;
}

function resizeAndSave($src, $dest, $maxDim = 1200, $quality = 82) {
    $info = @getimagesize($src);
    if (!$info) return false;
    [$w, $h, $type] = $info;
    switch ($type) {
        case IMAGETYPE_JPEG: $img = imagecreatefromjpeg($src); break;
        case IMAGETYPE_PNG:  $img = imagecreatefrompng($src);  break;
        case IMAGETYPE_GIF:  $img = imagecreatefromgif($src);  break;
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

$uploadDir = __DIR__ . "/../uploads/";
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// Build the URL prefix dynamically so it works both locally and on the server
$protocol    = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
$docRoot     = realpath($_SERVER['DOCUMENT_ROOT']);
$uploadsReal = realpath($uploadDir);
$uploadsRel  = str_replace('\\', '/', substr($uploadsReal, strlen($docRoot)));
$uploadsBase = $protocol . "://" . $_SERVER['HTTP_HOST'] . $uploadsRel;

$imagePaths = [];

for ($i = 0; $i < count($_FILES["images"]["name"]); $i++) {
    if ($_FILES["images"]["error"][$i] !== UPLOAD_ERR_OK) continue;

    $filename    = "listing_" . bin2hex(random_bytes(16)) . ".jpg";
    $destination = $uploadDir . $filename;

    $success = resizeAndSave($_FILES["images"]["tmp_name"][$i], $destination, 1200, 82);
    if (!$success) {
        move_uploaded_file($_FILES["images"]["tmp_name"][$i], $destination);
    }

    $imagePaths[] = $uploadsBase . "/" . $filename;
}

if (count($imagePaths) === 0) {
    http_response_code(500);
    echo json_encode(["message" => "Failed to upload images"]);
    exit;
}

$imagePath = $imagePaths[0]; // first image is thumbnail

$stmt = $conn->prepare("INSERT INTO listings (title, price, quantity, image, username, description, tags) VALUES (?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param("sdissss", $title, $price, $quantity, $imagePath, $username, $description, $tags);

if ($stmt->execute()) {
    $listingId = $stmt->insert_id;

    // insert ALL images (changed 1 → 0)
    if (count($imagePaths) > 1) {
        $imgStmt = $conn->prepare("INSERT INTO listing_images (listing_id, image_path) VALUES (?, ?)");
        for ($i = 0; $i < count($imagePaths); $i++) {
            $imgStmt->bind_param("is", $listingId, $imagePaths[$i]);
            $imgStmt->execute();
        }
        $imgStmt->close();
    }

    echo json_encode(["message" => "Listing created", "id" => $listingId]);
} else {
    http_response_code(500);
    echo json_encode(["message" => "Failed to create listing"]);
}

$stmt->close();
$conn->close();
?>