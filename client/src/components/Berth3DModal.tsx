import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Berth3DViewer from "@/components/Berth3DViewer";
import type { Scenario } from "@/lib/berth-model";

interface Berth3DModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: Scenario;
}

export default function Berth3DModal({ isOpen, onClose, scenario }: Berth3DModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="berth-3d-dialog">
        <DialogHeader className="berth-3d-dialog-header">
          <div className="section-kicker">MODELO ESQUEMÁTICO 3D</div>
          <DialogTitle>Visualização 3D da atracação</DialogTitle>
          <DialogDescription>
            Gire e amplie a cena. O modelo usa os dados deste cenário e não altera suas posições.
          </DialogDescription>
        </DialogHeader>
        <Berth3DViewer scenario={scenario} />
      </DialogContent>
    </Dialog>
  );
}
