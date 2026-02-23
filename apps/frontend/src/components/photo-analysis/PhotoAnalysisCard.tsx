import { AlertCircle, FileText, Image, Loader2 } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { PhotoAnalysisData } from "@/types/photo-analysis";
import {
  hasClassification,
  hasContentExtraction,
  hasDocumentAnalysis,
  hasObjectDetection,
  hasTechnicalAnalysis,
  hasVisualAnalysis,
} from "@/types/photo-analysis";

interface PhotoAnalysisCardProps {
  analysisData: PhotoAnalysisData | undefined;
  isLoading: boolean;
  error: Error | null;
  userDescription?: string | null;
  isEditing?: boolean;
  editDescription?: string;
  onDescriptionChange?: (value: string) => void;
  DescriptionEditor?: React.ReactNode;
}

export function PhotoAnalysisCard({
  analysisData,
  isLoading,
  error,
  userDescription,
  isEditing = false,
  DescriptionEditor,
}: PhotoAnalysisCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Analysis</CardTitle>
          <CardDescription>
            Loading automatic analysis and classification results...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading analysis data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Analysis</CardTitle>
          <CardDescription>
            Automatic analysis and classification results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Analysis</CardTitle>
        <CardDescription>
          Automatic analysis and classification results
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User Description */}
        <div>
          <Label className="text-sm font-medium">Description</Label>
          {isEditing ? (
            DescriptionEditor
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              {userDescription || "No description provided."}
            </p>
          )}
        </div>

        {analysisData && (
          <>
            {/* Classification */}
            {hasClassification(analysisData) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    <Label className="text-sm font-medium">
                      Image Classification
                    </Label>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Image Type
                    </Label>
                    <p className="text-sm text-muted-foreground capitalize">
                      {analysisData.aiAnalysis.classification.image_type.replace(
                        /_/g,
                        " ",
                      )}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      AI Description
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {analysisData.aiAnalysis.classification.description}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Object Detection */}
            {hasObjectDetection(analysisData) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Detected Objects
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {analysisData.aiAnalysis.object_detection.objects.map(
                      (object) => (
                        <Badge
                          key={object}
                          variant="outline"
                          className="capitalize"
                        >
                          {object}
                        </Badge>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Visual Analysis */}
            {hasVisualAnalysis(analysisData) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Visual Analysis</Label>

                  {analysisData.aiAnalysis.visual_analysis.dominant_colors &&
                    analysisData.aiAnalysis.visual_analysis.dominant_colors
                      .length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Dominant Colors
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {analysisData.aiAnalysis.visual_analysis.dominant_colors.map(
                            (color) => (
                              <Badge
                                key={color}
                                variant="secondary"
                                className="capitalize"
                              >
                                {color}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {analysisData.aiAnalysis.visual_analysis.mood_setting && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Mood & Setting
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {analysisData.aiAnalysis.visual_analysis.mood_setting}
                      </p>
                    </div>
                  )}

                  {analysisData.aiAnalysis.visual_analysis.tags &&
                    analysisData.aiAnalysis.visual_analysis.tags.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Visual Tags
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {analysisData.aiAnalysis.visual_analysis.tags.map(
                            (tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="capitalize"
                              >
                                {tag}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </>
            )}

            {/* Content Extraction */}
            {hasContentExtraction(analysisData) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <Label className="text-sm font-medium">
                      Extracted Text
                    </Label>
                  </div>
                  {analysisData.aiAnalysis.content_extraction.has_text ? (
                    <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded border font-mono whitespace-pre-wrap">
                      {
                        analysisData.aiAnalysis.content_extraction
                          .extracted_text
                      }
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No text found in image
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Document Analysis */}
            {hasDocumentAnalysis(analysisData) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Document Analysis
                  </Label>

                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Document Type
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {analysisData.aiAnalysis.document_analysis.document_type}
                    </p>
                  </div>

                  {analysisData.aiAnalysis.document_analysis.purpose && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Purpose
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {analysisData.aiAnalysis.document_analysis.purpose}
                      </p>
                    </div>
                  )}

                  {analysisData.aiAnalysis.document_analysis.tags &&
                    analysisData.aiAnalysis.document_analysis.tags.length >
                      0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Document Tags
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {analysisData.aiAnalysis.document_analysis.tags.map(
                            (tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="capitalize"
                              >
                                {tag}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </>
            )}

            {/* Technical Analysis */}
            {hasTechnicalAnalysis(analysisData) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Technical Analysis
                  </Label>

                  {analysisData.aiAnalysis.technical_analysis.diagram_type && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Diagram Type
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {
                          analysisData.aiAnalysis.technical_analysis
                            .diagram_type
                        }
                      </p>
                    </div>
                  )}

                  {analysisData.aiAnalysis.technical_analysis.main_concepts &&
                    analysisData.aiAnalysis.technical_analysis.main_concepts
                      .length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Main Concepts
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {analysisData.aiAnalysis.technical_analysis.main_concepts.map(
                            (concept) => (
                              <Badge
                                key={concept}
                                variant="secondary"
                                className="capitalize"
                              >
                                {concept}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {analysisData.aiAnalysis.technical_analysis.components &&
                    analysisData.aiAnalysis.technical_analysis.components
                      .length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Components
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {analysisData.aiAnalysis.technical_analysis.components.map(
                            (component) => (
                              <Badge
                                key={component}
                                variant="outline"
                                className="capitalize"
                              >
                                {component}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </>
            )}

            {/* Processing Information */}
            {analysisData.processedAt && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Processed At
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(analysisData.processedAt).toLocaleDateString(
                      undefined,
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
