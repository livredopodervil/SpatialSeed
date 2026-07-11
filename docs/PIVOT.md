# Pivô como estado do editor

O pivô não é armazenado no objeto regional.

Ele pertence ao `EditorState` e pode ser calculado por quatro políticas:

- `median`: média das origens dos membros;
- `bounds`: centro da caixa delimitadora conjunta;
- `active`: origem do membro ativo;
- `custom`: ponto livre editável pelo gizmo.

## Sessões

### Transformação da seleção

O gizmo atua sobre um `transformAnchor` temporário.

No início:

```text
A₀ = matriz inicial do pivô
Mᵢ = matriz inicial do objeto i
```

Durante a transformação:

```text
Δ = A₁ × A₀⁻¹
Mᵢ' = Δ × Mᵢ
```

Ao terminar, o renderer emite `selection.transform`.

### Edição do pivô

O mesmo gizmo move apenas o `transformAnchor`.

Nenhum comando regional é emitido. A posição é armazenada em:

```text
EditorState.pivot.customPosition
```

Portanto, editar o pivô não altera objetos, região ou sandbox.
