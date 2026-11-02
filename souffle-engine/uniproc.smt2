; Two consequences of "acyclic po-loc | ca | rf" (aarch64.cat:151) that keep
; z3 from proposing co/rf assignments the engine would reject one by one.
; (1) co agrees with po-loc on writes.
; (it forbids a trivial 2-node po-co cycle)
(assert (forall ((a Event) (b Event))
  (=> (and (W a) (W b) (po-loc a b)) (co a b))))
; (2) a read does not read from a write that another same-location write
;     overtakes in program order before the read.
; (it forbids a trivial 2-node fr-po cycle)
(assert (forall ((w Event) (w2 Event) (r Event))
  (=> (and (rf w r) (W w2) (po-loc w2 r) (co w w2)) false)))
