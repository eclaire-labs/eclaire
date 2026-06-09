import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";

export const statusIcons = {
  pending: <Clock className="h-4 w-4 text-warning" />,
  processing: <Loader2 className="h-4 w-4 text-info animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-success" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  retry_pending: <AlertCircle className="h-4 w-4 text-warning" />,
};

export const statusColors = {
  pending: "bg-warning/10 text-warning",
  processing: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  retry_pending: "bg-warning/10 text-warning",
};

// User-friendly stage names
const stageNames: Record<string, string> = {
  // Common stages
  result_saving: "Saving Results",
  result_processing: "Saving Results", // Same as result_saving for consistency
  ai_processing: "AI Analysis",
  ai_analysis: "AI Analysis", // For photos
  text_extraction: "Text Extraction",
  thumbnail_generation: "Creating Thumbnail",
  metadata_extraction: "Extracting Metadata",
  vector_embedding: "Creating Search Index",
  initialization: "Starting Process",
  validation: "Validating Input",
  cleanup: "Cleaning Up",
  completion: "Finalizing",

  // Photo-specific stages
  image_preparation: "Preparing Image",
  image_conversion: "Converting Image", // For HEIC conversion
  image_analysis: "Analyzing Image",

  // Document-specific stages
  pdf_generation: "Generating PDF", // Updated from "Processing File"
  file_processing: "Processing File",
  document_parsing: "Parsing Document",
  content_extraction: "Extracting Content",

  // Bookmark-specific stages
  content_analysis: "Extracting Content", // Changed from "Analyzing Content"
  ai_tagging: "AI Analysis",
  bookmark_processing: "Processing Bookmark",

  // Note-specific stages
  note_processing: "Processing Note",

  // Python worker stages (replace Docling with generic terms)
  document_download: "Downloading Document",
  docling_processing: "Text Extraction", // Changed from Docling implementation detail
  output_generation: "Generating Output",
  text_preparation: "Preparing Text",
  embedding_generation: "Creating Embeddings",
  index_creation: "Building Search Index",
  result_storage: "Storing Results",
};

export function getFriendlyStage(stage?: string): string {
  if (!stage) return "—";
  return (
    stageNames[stage] ||
    stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

export function getFriendlyCurrentStage(
  stage?: string,
  status?: string,
): string {
  // Don't show current stage for completed or failed jobs
  if (status === "completed" || status === "failed") {
    return "—";
  }
  return getFriendlyStage(stage);
}
