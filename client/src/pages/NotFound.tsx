import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Compass, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-lg mx-4 shadow-lg">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse" />
              <Compass className="relative h-16 w-16 text-accent" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>

          <h2 className="text-xl font-semibold text-foreground mb-4">
            Página não encontrada
          </h2>

          <p className="text-muted-foreground mb-2 leading-relaxed">
            A página que você está procurando não existe ou foi movida.
          </p>
          <p className="text-xs text-muted-foreground/70 mb-8">SELVA Spaces</p>

          <div className="flex justify-center">
            <Button onClick={() => setLocation("/")} className="px-6 py-2.5">
              <Home className="w-4 h-4 mr-2" />
              Voltar para o início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
