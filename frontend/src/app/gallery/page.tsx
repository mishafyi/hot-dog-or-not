"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { DatasetStatus, ImagePrediction } from "@/lib/types";

interface ImageEntry {
  split: string;
  category: string;
  filename: string;
}

const PAGE_SIZE = 30;

export default function GalleryPage() {
  const [dataset, setDataset] = useState<DatasetStatus | null>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedImage, setSelectedImage] = useState<ImageEntry | null>(null);
  const [predictions, setPredictions] = useState<ImagePrediction[]>([]);
  const [loadingPreds, setLoadingPreds] = useState(false);

  useEffect(() => {
    api.getDatasetStatus().then((status) => {
      setDataset(status);
      if (status.downloaded) {
        api.listDatasetImages().then((imgs) => {
          setImages(imgs.map((img) => ({
            split: img.split,
            category: img.category,
            filename: img.filename,
          })));
        }).catch(console.error);
      }
    });
  }, []);

  const filteredImages =
    filterCategory === "all"
      ? images
      : images.filter((img) => img.category === filterCategory);

  const totalPages = Math.ceil(filteredImages.length / PAGE_SIZE);
  const visible = filteredImages.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

  const handleImageClick = async (img: ImageEntry) => {
    setSelectedImage(img);
    setLoadingPreds(true);
    try {
      const preds = await api.getImagePredictions(
        img.split,
        img.category,
        img.filename
      );
      setPredictions(preds);
    } catch {
      setPredictions([]);
    } finally {
      setLoadingPreds(false);
    }
  };

  if (!dataset) {
    return (
      <div className="space-y-6 py-6">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72 mt-2" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!dataset.downloaded) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium">No images found</p>
        <p className="mt-1">
          Add images to{" "}
          <code className="bg-muted px-1 rounded">
            backend/data/test/hot_dog/
          </code>{" "}
          and{" "}
          <code className="bg-muted px-1 rounded">
            backend/data/test/not_hot_dog/
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Image Gallery</h1>
        <p className="text-muted-foreground mt-1">
          Browse dataset images and see model predictions
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="hot_dog">Hot Dogs</SelectItem>
            <SelectItem value="not_hot_dog">Not Hot Dogs</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filteredImages.length} images
        </span>
      </div>

      {images.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p>
            Run a benchmark first to populate the gallery, or images will appear
            once results are available.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {visible.map((img) => (
              <button
                key={`${img.split}/${img.category}/${img.filename}`}
                onClick={() => handleImageClick(img)}
                className="rounded-lg border bg-card overflow-hidden text-left hover:ring-2 ring-primary transition-shadow"
              >
                <div className="aspect-square bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={api.imageUrl(img.split, img.category, img.filename)}
                    alt={`${img.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${img.filename}`}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
                <div className="p-1.5">
                  <Badge
                    variant={
                      img.category === "hot_dog" ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {img.category === "hot_dog" ? "Hot Dog" : "Not Hot Dog"}
                  </Badge>
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedImage?.filename}
            </DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <ScrollArea className="flex-1 -mr-4 pr-4">
              <div className="space-y-4">
                <div className="aspect-square bg-muted rounded-md overflow-hidden max-h-64 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={api.imageUrl(
                      selectedImage.split,
                      selectedImage.category,
                      selectedImage.filename
                    )}
                    alt={`${selectedImage.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${selectedImage.filename}`}
                    className="object-contain max-h-full"
                  />
                </div>
                <div>
                  <p className="text-sm">
                    Ground truth:{" "}
                    <Badge
                      variant={
                        selectedImage.category === "hot_dog"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {selectedImage.category === "hot_dog"
                        ? "Hot Dog"
                        : "Not Hot Dog"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Model Predictions
                  </h3>
                  {loadingPreds ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : predictions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No predictions yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {predictions.map((pred) => (
                        <div
                          key={pred.model_id}
                          className="flex items-center justify-between text-sm border rounded px-3 py-2"
                        >
                          <span className="font-medium">{pred.model_name}</span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                pred.correct ? "default" : "destructive"
                              }
                            >
                              {pred.parsed}
                            </Badge>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {pred.latency_ms.toFixed(0)}ms
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
