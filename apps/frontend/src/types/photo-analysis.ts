// Photo Analysis Types based on the extracted.json structure

export interface PhotoAnalysisClassification {
  image_type: string;
  description: string;
}

export interface PhotoAnalysisObjectDetection {
  objects: string[];
}

export interface PhotoAnalysisVisualAnalysis {
  dominant_colors: string[];
  tags: string[];
  mood_setting: string;
}

export interface PhotoAnalysisContentExtraction {
  extracted_text: string;
  has_text: boolean;
}

export interface PhotoAnalysisDocumentAnalysis {
  document_type: string;
  tags: string[];
  purpose: string;
}

export interface PhotoAnalysisTechnicalAnalysis {
  main_concepts: string[];
  components: string[];
  tags: string[];
  diagram_type: string;
}

export interface PhotoAnalysisConversion {
  originalMimeType: string;
  convertedTo: string;
  convertedJpgStorageId: string;
}

export interface PhotoAnalysisThumbnail {
  thumbnailStorageId: string;
}

export interface PhotoAnalysisData {
  photoId: string;
  mimeType: string;
  originalFilename: string;
  processedAt: string;
  aiAnalysis: {
    classification?: PhotoAnalysisClassification;
    object_detection?: PhotoAnalysisObjectDetection;
    visual_analysis?: PhotoAnalysisVisualAnalysis;
    content_extraction?: PhotoAnalysisContentExtraction;
    document_analysis?: PhotoAnalysisDocumentAnalysis;
    technical_analysis?: PhotoAnalysisTechnicalAnalysis;
  };
  conversion?: PhotoAnalysisConversion;
  thumbnail?: PhotoAnalysisThumbnail;
  processedTags?: string[];
}

// Helper type to get the available analysis stages for a photo
export type AnalysisStage = keyof PhotoAnalysisData["aiAnalysis"];

// Type guard functions
export function hasClassification(
  data: PhotoAnalysisData,
): data is PhotoAnalysisData & {
  aiAnalysis: { classification: PhotoAnalysisClassification };
} {
  return !!data.aiAnalysis.classification;
}

export function hasObjectDetection(
  data: PhotoAnalysisData,
): data is PhotoAnalysisData & {
  aiAnalysis: { object_detection: PhotoAnalysisObjectDetection };
} {
  return !!data.aiAnalysis.object_detection;
}

export function hasVisualAnalysis(
  data: PhotoAnalysisData,
): data is PhotoAnalysisData & {
  aiAnalysis: { visual_analysis: PhotoAnalysisVisualAnalysis };
} {
  return !!data.aiAnalysis.visual_analysis;
}

export function hasContentExtraction(
  data: PhotoAnalysisData,
): data is PhotoAnalysisData & {
  aiAnalysis: { content_extraction: PhotoAnalysisContentExtraction };
} {
  return !!data.aiAnalysis.content_extraction;
}

export function hasDocumentAnalysis(
  data: PhotoAnalysisData,
): data is PhotoAnalysisData & {
  aiAnalysis: { document_analysis: PhotoAnalysisDocumentAnalysis };
} {
  return !!data.aiAnalysis.document_analysis;
}

export function hasTechnicalAnalysis(
  data: PhotoAnalysisData,
): data is PhotoAnalysisData & {
  aiAnalysis: { technical_analysis: PhotoAnalysisTechnicalAnalysis };
} {
  return !!data.aiAnalysis.technical_analysis;
}
