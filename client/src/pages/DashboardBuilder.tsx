/**
 * DashboardBuilder.tsx — Módulo independente de geração de dashboards analíticos.
 * Não interfere com nenhuma funcionalidade existente da plataforma.
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Upload,
  X,
  FileText,
  Clock,
  Trash2,
  ExternalLink,
  Loader2,
  ImageIcon,
  ChevronRight,
  BarChart2,
  GitCompare,
} from "lucide-react";
import { toast } from "sonner";

// ─── Upload de imagem para S3 ─────────────────────────────────────────────────

async function uploadImageToS3(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/dashboard-builder/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Falha no upload da imagem");
  }
  const data = await res.json();
  return data.url as string;
}

// ─── Componente de upload de imagem ──────────────────────────────────────────

function ImageUploadSlot({
  label,
  sublabel,
  file,
  preview,
  onSelect,
  onRemove,
}: {
  label: string;
  sublabel: string;
  file: File | null;
  preview: string | null;
  onSelect: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onSelect(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      <p className="text-xs text-muted-foreground -mt-1">{sublabel}</p>
      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
          <img src={preview} alt={label} className="w-full h-40 object-contain" />
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 bg-background/90 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <X size={14} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-3 py-1.5">
            <p className="text-xs text-muted-foreground truncate">{file?.name}</p>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg h-40 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <ImageIcon size={28} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground/60">PNG, JPG, WEBP</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardBuilder() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"SINGLE" | "COMPARATIVE">("SINGLE");
  const [clientName, setClientName] = useState("");
  const [weeklyContext, setWeeklyContext] = useState("");
  const [file1, setFile1] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const utils = trpc.useUtils();

  const { data: reports, isLoading: loadingReports } = trpc.dashboardBuilder.list.useQuery();

  const generateMutation = trpc.dashboardBuilder.generate.useMutation({
    onSuccess: (data) => {
      utils.dashboardBuilder.list.invalidate();
      toast.success("Dashboard gerado com sucesso!");
      navigate(`/dashboard-builder/${data.id}`);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar dashboard: ${err.message}`);
      setIsGenerating(false);
    },
  });

  const deleteMutation = trpc.dashboardBuilder.delete.useMutation({
    onSuccess: () => {
      utils.dashboardBuilder.list.invalidate();
      toast.success("Relatório excluído");
    },
  });

  const handleSelectFile1 = (f: File) => {
    setFile1(f);
    setPreview1(URL.createObjectURL(f));
  };
  const handleSelectFile2 = (f: File) => {
    setFile2(f);
    setPreview2(URL.createObjectURL(f));
  };

  const handleGenerate = async () => {
    if (!clientName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (!weeklyContext.trim()) {
      toast.error("Informe o contexto semanal");
      return;
    }
    if (mode === "SINGLE" && !file1) {
      toast.error("Selecione ao menos 1 print de campanha");
      return;
    }
    if (mode === "COMPARATIVE" && (!file1 || !file2)) {
      toast.error("No modo comparativo, selecione os 2 prints");
      return;
    }

    setIsGenerating(true);
    try {
      const imageUrls: string[] = [];
      if (file1) {
        toast.info("Enviando imagem 1...");
        const url1 = await uploadImageToS3(file1);
        imageUrls.push(url1);
      }
      if (file2 && mode === "COMPARATIVE") {
        toast.info("Enviando imagem 2...");
        const url2 = await uploadImageToS3(file2);
        imageUrls.push(url2);
      }

      toast.info("Analisando campanhas com IA...");
      await generateMutation.mutateAsync({
        clientName: clientName.trim(),
        weeklyContext: weeklyContext.trim(),
        mode,
        imageUrls,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro inesperado");
      setIsGenerating(false);
    }
  };

  const contextWordCount = weeklyContext.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10">
          <LayoutDashboard size={24} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Builder</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gere dashboards analíticos profissionais em PDF a partir dos prints do gerenciador de anúncios
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ─── Formulário ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo Dashboard</CardTitle>
              <CardDescription>Preencha os dados abaixo para gerar a análise</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Modo */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Modo de Operação</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setMode("SINGLE"); setFile2(null); setPreview2(null); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === "SINGLE"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <BarChart2 size={18} className={mode === "SINGLE" ? "text-primary" : "text-muted-foreground"} />
                    <div>
                      <p className={`text-sm font-medium ${mode === "SINGLE" ? "text-primary" : "text-foreground"}`}>
                        Período Único
                      </p>
                      <p className="text-xs text-muted-foreground">1 print, sem comparativo</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setMode("COMPARATIVE")}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === "COMPARATIVE"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <GitCompare size={18} className={mode === "COMPARATIVE" ? "text-primary" : "text-muted-foreground"} />
                    <div>
                      <p className={`text-sm font-medium ${mode === "COMPARATIVE" ? "text-primary" : "text-foreground"}`}>
                        Comparativo
                      </p>
                      <p className="text-xs text-muted-foreground">2 prints com variação %</p>
                    </div>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Nome do cliente */}
              <div className="space-y-2">
                <Label htmlFor="clientName" className="text-sm font-semibold">
                  Nome do Cliente <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="clientName"
                  placeholder="Ex: Empresa XYZ"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              {/* Contexto semanal */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="context" className="text-sm font-semibold">
                    Contexto Semanal <span className="text-destructive">*</span>
                  </Label>
                  <span className={`text-xs ${contextWordCount < 20 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {contextWordCount} palavras {contextWordCount < 20 && "— mínimo recomendado: 20"}
                  </span>
                </div>
                <Textarea
                  id="context"
                  placeholder="Descreva o que foi feito, alterado, testado, pausado ou lançado na semana. Quanto mais detalhado, mais precisa será a análise."
                  value={weeklyContext}
                  onChange={(e) => setWeeklyContext(e.target.value)}
                  rows={4}
                  disabled={isGenerating}
                  className="resize-none"
                />
                {contextWordCount < 20 && contextWordCount > 0 && (
                  <p className="text-xs text-amber-500">
                    ⚠️ Contexto reduzido. A análise pode ser mais superficial.
                  </p>
                )}
              </div>

              <Separator />

              {/* Upload de imagens */}
              <div className="space-y-4">
                <Label className="text-sm font-semibold">
                  Print(s) do Gerenciador <span className="text-destructive">*</span>
                </Label>
                <div className={`grid gap-4 ${mode === "COMPARATIVE" ? "grid-cols-2" : "grid-cols-1"}`}>
                  <ImageUploadSlot
                    label={mode === "COMPARATIVE" ? "Período Atual" : "Print das Campanhas"}
                    sublabel={mode === "COMPARATIVE" ? "Referência principal" : "Screenshot do gerenciador de anúncios"}
                    file={file1}
                    preview={preview1}
                    onSelect={handleSelectFile1}
                    onRemove={() => { setFile1(null); setPreview1(null); }}
                  />
                  {mode === "COMPARATIVE" && (
                    <ImageUploadSlot
                      label="Período Anterior"
                      sublabel="Para cálculo de variação"
                      file={file2}
                      preview={preview2}
                      onSelect={handleSelectFile2}
                      onRemove={() => { setFile2(null); setPreview2(null); }}
                    />
                  )}
                </div>
              </div>

              {/* Botão gerar */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Gerando dashboard...
                  </>
                ) : (
                  <>
                    <LayoutDashboard size={16} className="mr-2" />
                    Gerar Dashboard
                  </>
                )}
              </Button>

              {isGenerating && (
                <p className="text-xs text-center text-muted-foreground">
                  A análise pode levar entre 15 e 60 segundos dependendo do volume de campanhas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Histórico ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Dashboards Gerados</h2>
            {reports && reports.length > 0 && (
              <Badge variant="secondary">{reports.length}</Badge>
            )}
          </div>

          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <FileText size={32} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nenhum dashboard gerado ainda. Preencha o formulário e clique em Gerar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <Card
                  key={r.id}
                  className="hover:border-primary/40 transition-colors cursor-pointer group"
                  onClick={() => r.status === "DONE" && navigate(`/dashboard-builder/${r.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {r.clientName}
                          </p>
                          <Badge
                            variant={
                              r.status === "DONE"
                                ? "default"
                                : r.status === "ERROR"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs shrink-0"
                          >
                            {r.status === "DONE"
                              ? "Pronto"
                              : r.status === "ERROR"
                              ? "Erro"
                              : r.status === "PROCESSING"
                              ? "Processando..."
                              : "Pendente"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(r.createdAt).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          {r.platform && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-xs">
                              {r.platform}
                            </span>
                          )}
                          <span className="bg-muted px-1.5 py-0.5 rounded text-xs">
                            {r.mode === "COMPARATIVE" ? "Comparativo" : "Período Único"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.status === "DONE" && (
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground group-hover:text-primary transition-colors"
                          />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate({ id: r.id });
                          }}
                          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {r.status === "ERROR" && r.errorMessage && (
                      <p className="text-xs text-destructive mt-2 line-clamp-2">{r.errorMessage}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
