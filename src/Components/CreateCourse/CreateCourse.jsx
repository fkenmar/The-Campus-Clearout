import React, { useState, useEffect } from "react";
import "./CreateCourse.css";

const createCourseMessages = {
    "Course created successfully!": "Course created successfully.",
    "Course created successfully": "Course created successfully.",
    "Network error": "We are unable to process the request right now. Please try again later.",
    "Something went wrong": "We could not process the request. Please try again.",
};

const getCreateCourseMessage = (message, fallback) =>
    createCourseMessages[message] || message || fallback;

const COURSE_TITLE_MAX_LENGTH = 100;
const COURSE_DESCRIPTION_MAX_LENGTH = 300;
const MATERIAL_MAX_LENGTH = 100;

const getLimitMessage = (field, max) =>
    `${field} has reached the ${max}-character limit.`;

// NEW: Make sure editData is in this props list!
export default function CreateCourse({ isOpen, onClose, onSuccess, editData }) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [materials, setMaterials] = useState([]);
    const [materialInput, setMaterialInput] = useState("");
    const [selectedTags, setSelectedTags] = useState([]);
    const [error, setError] = useState("");
    const [limitError, setLimitError] = useState("");
    const [success, setSuccess] = useState("");

    const TAG_OPTIONS = [
        "AAS", "APY", "ARC", "ART", "ASL", "BCH", "BIO", "BPH", "CAS", "CDA", 
        "CE", "CHE", "CHI", "CL", "COM", "CPM", "CSE", "DAC", "DAE", "DMS", 
        "ECO", "EE", "ELI", "ENG", "END", "ES", "FR", "GEO", "GER", "GLY", 
        "GR", "HIS", "HON", "IEF", "IE", "ITA", "JPN", "KOR", "LAT", "LAW", 
        "LAI", "LIN", "MAE", "MGA", "MGB", "MGF", "MGI", "MGO", "MGS", "MGT", 
        "MIC", "MTH", "MTR", "MUS", "NRS", "NSG", "NTR", "OT", "PAS", "PGY", 
        "PHI", "PHO", "PHY", "POL", "PMY", "POR", "PSY", "PT", "PUB", "REC", 
        "RUS", "SSC", "SOC", "SPA", "SSP", "TH", "UBE", "URP", "VS"
    ];

    // PRE-FILL FORM FOR EDIT MODE
    useEffect(() => {
        if (editData) {
            setTitle(editData.title || "");
            setDescription(editData.description || "");
            setMaterials(editData.materials ? editData.materials.split(",").map(m => m.trim()) : []);
            setSelectedTags(editData.tags ? editData.tags.split(",").map(t => t.trim()) : []);
        } else {
            setTitle("");
            setDescription("");
            setMaterials([]);
            setMaterialInput("");
            setSelectedTags([]);
        }
        setError("");
        setLimitError("");
        setSuccess("");
    }, [editData, isOpen]);

    if (!isOpen) return null;

    const toggleTag = (tag) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    const handleAddMaterial = () => {
        const val = materialInput.trim();
        if (val) {
            setMaterials((prev) => [...prev, val]);
            setMaterialInput("");
            setLimitError("");
        }
    };

    const handleRemoveMaterial = (index) => {
        setMaterials((prev) => prev.filter((_, i) => i !== index));
    };

    const handleLimitedChange = (value, setter, field, max) => {
        setter(value);
        setLimitError(value.length === max ? getLimitMessage(field, max) : "");
    };

    const handleCreateCourse = async () => {
        setError("");
        setSuccess("");
        setLimitError("");

        const t = title.trim();
        const d = description.trim();
        const m = materials.join(", ");
        const tg = selectedTags.join(",");

        if (!t || !d || materials.length === 0 || selectedTags.length === 0) {
            setError("Please complete all fields and select at least one tag.");
            return;
        }

        const formData = new FormData();
        formData.append("title", t);
        formData.append("description", d);
        formData.append("materials", m);
        formData.append("tags", tg);
        
        // If we are editing, append the ID so the backend knows which course to update
        if (editData) {
            formData.append("course_id", editData.id);
        }

        try {
            const token = localStorage.getItem("token");
            
            // Switch endpoints based on whether editData exists
            const endpoint = editData 
                ? "/CSE442/2026-Spring/cse-442s/api/update_course.php" 
                : "/CSE442/2026-Spring/cse-442s/api/createcourse.php";

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                setError(getCreateCourseMessage(data.error, "We could not process the request. Please try again."));
                return;
            }

            setSuccess(editData ? "Course updated successfully." : "Course created successfully.");

        } catch (err) {
            setError("We are unable to process the request right now. Please try again later.");
        }
    };

    const handleSuccessOkay = () => {
        setSuccess("");
        if (onSuccess) onSuccess(); 
        onClose();
    };

    return (
        <div className="cl-overlay">
            <div className="cl-page">
                <button className="cl-close" onClick={onClose}>×</button>

                {/* DYNAMIC TITLE */}
                <h2 className="cl-title">{editData ? "Edit Course" : "Create a Course"}</h2>

                {(limitError || error) && (
                    <div className="cl-error" role="alert">
                        {limitError || error}
                    </div>
                )}

                {success && (
                    <div className="cl-success-popup" role="status">
                        <div className="cl-success-message">{success}</div>
                        <button className="cl-success-btn" onClick={handleSuccessOkay}>
                            Okay
                        </button>
                    </div>
                )}

                {!success && (
                    <>
                        <div className="cl-section">
                            <label className="cl-label">Course Title</label>
                            <input
                                className="cl-input"
                                value={title}
                                onChange={(e) => handleLimitedChange(e.target.value, setTitle, "Course title", COURSE_TITLE_MAX_LENGTH)}
                                placeholder="Enter course title"
                                maxLength={COURSE_TITLE_MAX_LENGTH}
                            />
                        </div>

                        <div className="cl-section">
                            <label className="cl-label">Description</label>
                            <textarea
                                className="cl-textarea cl-description"
                                value={description}
                                onChange={(e) => handleLimitedChange(e.target.value, setDescription, "Description", COURSE_DESCRIPTION_MAX_LENGTH)}
                                placeholder="Describe the course"
                                maxLength={COURSE_DESCRIPTION_MAX_LENGTH}
                            />
                        </div>

                        <div className="cl-section">
                            <label className="cl-label">Materials</label>
                            <div className="cl-material-input-row">
                                <input
                                    className="cl-input cl-material-input"
                                    value={materialInput}
                                    onChange={(e) => handleLimitedChange(e.target.value, setMaterialInput, "Material", MATERIAL_MAX_LENGTH)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddMaterial(); } }}
                                    placeholder="Enter a material..."
                                    maxLength={MATERIAL_MAX_LENGTH}
                                />
                                <button type="button" className="cl-add-btn" onClick={handleAddMaterial}>+ Add</button>
                            </div>
                            {materials.length > 0 && (
                                <ul className="cl-material-list">
                                    {materials.map((item, index) => (
                                        <li key={index} className="cl-material-item">
                                            <span className="cl-material-text">{item}</span>
                                            <button type="button" className="cl-material-remove" onClick={() => handleRemoveMaterial(index)}>×</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                
                        <div className="cl-section">
                            <label className="cl-label">Tags</label>
                            <div className="cl-tag-row" style={{ maxHeight: "150px", overflowY: "auto" }}>
                                {TAG_OPTIONS.map((tag) => (
                                    <label
                                        key={tag}
                                        className={"cl-tag-checkbox" + (selectedTags.includes(tag) ? " cl-tag-checked" : "")}
                                        onClick={() => toggleTag(tag)}
                                    >
                                        {tag}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="cl-footer">
                            <button className="cl-cancel-btn" onClick={onClose}>Cancel</button>
                            <button className="cl-create-btn" onClick={handleCreateCourse}>
                                {/* DYNAMIC SUBMIT BUTTON */}
                                {editData ? "Save Changes" : "Create"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}