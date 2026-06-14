#!/usr/bin/env python3
import os
import sys

# Unicode chess pieces
PIECES = {
    ('K', 'white'): '♔', ('Q', 'white'): '♕', ('R', 'white'): '♖',
    ('B', 'white'): '♗', ('N', 'white'): '♘', ('P', 'white'): '♙',
    ('K', 'black'): '♚', ('Q', 'black'): '♛', ('R', 'black'): '♜',
    ('B', 'black'): '♝', ('N', 'black'): '♞', ('P', 'black'): '♟',
}

COLORS = {
    'reset': '\033[0m',
    'bold': '\033[1m',
    'white_piece': '\033[97m',
    'black_piece': '\033[30m',
    'light_sq': '\033[48;5;180m',
    'dark_sq': '\033[48;5;94m',
    'highlight': '\033[48;5;226m',
    'check': '\033[48;5;196m',
    'red': '\033[91m',
    'green': '\033[92m',
    'yellow': '\033[93m',
    'cyan': '\033[96m',
}


class Piece:
    def __init__(self, kind, color):
        self.kind = kind
        self.color = color
        self.moved = False

    def __repr__(self):
        return f"{self.color[0].upper()}{self.kind}"

    def symbol(self):
        return PIECES[(self.kind, self.color)]


class Board:
    def __init__(self):
        self.grid = [[None] * 8 for _ in range(8)]
        self.turn = 'white'
        self.en_passant = None  # square vulnerable to en passant
        self.halfmove_clock = 0
        self.fullmove = 1
        self.history = []
        self._setup()

    def _setup(self):
        order = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        for col, kind in enumerate(order):
            self.grid[0][col] = Piece(kind, 'black')
            self.grid[7][col] = Piece(kind, 'white')
        for col in range(8):
            self.grid[1][col] = Piece('P', 'black')
            self.grid[6][col] = Piece('P', 'white')

    def at(self, r, c):
        if 0 <= r < 8 and 0 <= c < 8:
            return self.grid[r][c]
        return None

    def display(self, highlights=None, check_king=None):
        highlights = highlights or set()
        os.system('clear' if os.name == 'posix' else 'cls')
        print()
        print(f"  {COLORS['bold']}╔═══════════════════════╗{COLORS['reset']}")
        for row in range(8):
            rank_label = 8 - row
            print(f"  {COLORS['bold']}║{COLORS['reset']} {rank_label} ", end='')
            for col in range(8):
                piece = self.grid[row][col]
                is_light = (row + col) % 2 == 0
                sq = (row, col)

                if check_king and sq == check_king:
                    bg = COLORS['check']
                elif sq in highlights:
                    bg = COLORS['highlight']
                elif is_light:
                    bg = COLORS['light_sq']
                else:
                    bg = COLORS['dark_sq']

                if piece:
                    fg = COLORS['white_piece'] if piece.color == 'white' else COLORS['black_piece']
                    print(f"{bg}{fg} {piece.symbol()} {COLORS['reset']}", end='')
                else:
                    print(f"{bg}   {COLORS['reset']}", end='')
            print(f" {COLORS['bold']}║{COLORS['reset']}")
        print(f"  {COLORS['bold']}╠═══════════════════════╣{COLORS['reset']}")
        print(f"  {COLORS['bold']}║{COLORS['reset']}    a  b  c  d  e  f  g  h  {COLORS['bold']}║{COLORS['reset']}")
        print(f"  {COLORS['bold']}╚═══════════════════════╝{COLORS['reset']}")

    def _pawn_moves(self, r, c, color, for_attack=False):
        moves = []
        dr = -1 if color == 'white' else 1
        start_row = 6 if color == 'white' else 1

        if not for_attack:
            # Forward
            if self.at(r + dr, c) is None:
                moves.append((r + dr, c))
                if r == start_row and self.at(r + 2 * dr, c) is None:
                    moves.append((r + 2 * dr, c))
        # Diagonal captures
        for dc in [-1, 1]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                target = self.at(nr, nc)
                if for_attack:
                    moves.append((nr, nc))
                elif target and target.color != color:
                    moves.append((nr, nc))
                elif (nr, nc) == self.en_passant:
                    moves.append((nr, nc))
        return moves

    def _knight_moves(self, r, c, color):
        moves = []
        for dr, dc in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                target = self.at(nr, nc)
                if target is None or target.color != color:
                    moves.append((nr, nc))
        return moves

    def _slide_moves(self, r, c, color, directions):
        moves = []
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            while 0 <= nr < 8 and 0 <= nc < 8:
                target = self.at(nr, nc)
                if target is None:
                    moves.append((nr, nc))
                elif target.color != color:
                    moves.append((nr, nc))
                    break
                else:
                    break
                nr += dr
                nc += dc
        return moves

    def _king_moves(self, r, c, color):
        moves = []
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if 0 <= nr < 8 and 0 <= nc < 8:
                    target = self.at(nr, nc)
                    if target is None or target.color != color:
                        moves.append((nr, nc))
        # Castling
        piece = self.at(r, c)
        if piece and not piece.moved:
            back_row = 7 if color == 'white' else 0
            if r == back_row:
                # Kingside
                rook = self.at(r, 7)
                if (rook and rook.kind == 'R' and not rook.moved
                        and self.at(r, 5) is None and self.at(r, 6) is None
                        and not self.is_attacked(r, 4, color)
                        and not self.is_attacked(r, 5, color)
                        and not self.is_attacked(r, 6, color)):
                    moves.append((r, 6))
                # Queenside
                rook = self.at(r, 0)
                if (rook and rook.kind == 'R' and not rook.moved
                        and self.at(r, 1) is None and self.at(r, 2) is None and self.at(r, 3) is None
                        and not self.is_attacked(r, 4, color)
                        and not self.is_attacked(r, 3, color)
                        and not self.is_attacked(r, 2, color)):
                    moves.append((r, 2))
        return moves

    def raw_moves(self, r, c):
        piece = self.at(r, c)
        if not piece:
            return []
        color, kind = piece.color, piece.kind
        if kind == 'P':
            return self._pawn_moves(r, c, color)
        if kind == 'N':
            return self._knight_moves(r, c, color)
        if kind == 'B':
            return self._slide_moves(r, c, color, [(-1,-1),(-1,1),(1,-1),(1,1)])
        if kind == 'R':
            return self._slide_moves(r, c, color, [(-1,0),(1,0),(0,-1),(0,1)])
        if kind == 'Q':
            return self._slide_moves(r, c, color,
                [(-1,-1),(-1,1),(1,-1),(1,1),(-1,0),(1,0),(0,-1),(0,1)])
        if kind == 'K':
            return self._king_moves(r, c, color)
        return []

    def is_attacked(self, r, c, by_color):
        enemy = 'black' if by_color == 'white' else 'white'
        for row in range(8):
            for col in range(8):
                piece = self.at(row, col)
                if piece and piece.color == enemy:
                    if piece.kind == 'P':
                        attacks = self._pawn_moves(row, col, enemy, for_attack=True)
                    elif piece.kind == 'K':
                        attacks = []
                        for dr in [-1, 0, 1]:
                            for dc in [-1, 0, 1]:
                                if dr == 0 and dc == 0:
                                    continue
                                nr, nc = row + dr, col + dc
                                if 0 <= nr < 8 and 0 <= nc < 8:
                                    attacks.append((nr, nc))
                    else:
                        attacks = self.raw_moves(row, col)
                    if (r, c) in attacks:
                        return True
        return False

    def find_king(self, color):
        for r in range(8):
            for c in range(8):
                p = self.at(r, c)
                if p and p.kind == 'K' and p.color == color:
                    return (r, c)
        return None

    def in_check(self, color):
        king_pos = self.find_king(color)
        if not king_pos:
            return False
        return self.is_attacked(king_pos[0], king_pos[1], color)

    def legal_moves(self, r, c):
        piece = self.at(r, c)
        if not piece or piece.color != self.turn:
            return []
        legal = []
        for nr, nc in self.raw_moves(r, c):
            if self._try_move_safe(r, c, nr, nc):
                legal.append((nr, nc))
        return legal

    def _try_move_safe(self, r, c, nr, nc):
        # Simulate move and check if own king is in check
        saved_ep = self.en_passant
        piece = self.grid[r][c]
        captured = self.grid[nr][nc]
        ep_captured = None

        self.grid[nr][nc] = piece
        self.grid[r][c] = None

        # En passant capture
        if piece.kind == 'P' and (nr, nc) == saved_ep:
            ep_row = r
            ep_captured = self.grid[ep_row][nc]
            self.grid[ep_row][nc] = None

        result = not self.in_check(piece.color)

        # Undo
        self.grid[r][c] = piece
        self.grid[nr][nc] = captured
        if ep_captured is not None:
            self.grid[r][nc] = ep_captured
        self.en_passant = saved_ep
        return result

    def apply_move(self, r, c, nr, nc, promotion='Q'):
        piece = self.grid[r][c]
        captured = self.grid[nr][nc]
        ep_capture_pos = None

        # En passant
        if piece.kind == 'P' and (nr, nc) == self.en_passant:
            ep_capture_pos = (r, nc)
            captured = self.grid[r][nc]
            self.grid[r][nc] = None

        # Update en passant target
        if piece.kind == 'P' and abs(nr - r) == 2:
            self.en_passant = ((r + nr) // 2, c)
        else:
            self.en_passant = None

        self.grid[nr][nc] = piece
        self.grid[r][c] = None
        piece.moved = True

        # Castling rook move
        if piece.kind == 'K' and abs(nc - c) == 2:
            if nc == 6:  # kingside
                rook = self.grid[nr][7]
                self.grid[nr][5] = rook
                self.grid[nr][7] = None
                if rook:
                    rook.moved = True
            elif nc == 2:  # queenside
                rook = self.grid[nr][0]
                self.grid[nr][3] = rook
                self.grid[nr][0] = None
                if rook:
                    rook.moved = True

        # Pawn promotion
        if piece.kind == 'P' and (nr == 0 or nr == 7):
            self.grid[nr][nc] = Piece(promotion, piece.color)

        # Halfmove clock
        if piece.kind == 'P' or captured:
            self.halfmove_clock = 0
        else:
            self.halfmove_clock += 1

        if self.turn == 'black':
            self.fullmove += 1

        self.turn = 'black' if self.turn == 'white' else 'white'
        return captured

    def all_legal_moves(self, color):
        moves = []
        for r in range(8):
            for c in range(8):
                p = self.at(r, c)
                if p and p.color == color:
                    for nr, nc in self.legal_moves(r, c):
                        moves.append((r, c, nr, nc))
        return moves

    def is_checkmate(self):
        return self.in_check(self.turn) and not self.all_legal_moves(self.turn)

    def is_stalemate(self):
        return not self.in_check(self.turn) and not self.all_legal_moves(self.turn)

    def is_draw_50(self):
        return self.halfmove_clock >= 100


def parse_square(s):
    s = s.strip().lower()
    if len(s) != 2:
        return None
    col = ord(s[0]) - ord('a')
    row = 8 - int(s[1])
    if 0 <= row < 8 and 0 <= col < 8:
        return (row, col)
    return None


def square_name(r, c):
    return f"{'abcdefgh'[c]}{8 - r}"


def get_promotion_choice():
    while True:
        print(f"\n  {COLORS['cyan']}Promotion ! Choisissez : Q(dame) R(tour) B(fou) N(cavalier){COLORS['reset']}")
        choice = input("  > ").strip().upper()
        if choice in ['Q', 'R', 'B', 'N']:
            return choice
        print(f"  {COLORS['red']}Choix invalide.{COLORS['reset']}")


def print_status(board):
    color_fr = 'Blancs' if board.turn == 'white' else 'Noirs'
    color_code = COLORS['white_piece'] if board.turn == 'white' else COLORS['cyan']
    in_check = board.in_check(board.turn)
    check_str = f"  {COLORS['red']}[EN ÉCHEC !]{COLORS['reset']}" if in_check else ""
    print(f"\n  {color_code}{COLORS['bold']}Tour {board.fullmove} — {color_fr}{COLORS['reset']}{check_str}")
    print(f"  {COLORS['yellow']}Entrez : ex. e2 e4  |  'aide' pour les coups  |  'quitter'{COLORS['reset']}")


def main():
    board = Board()
    selected = None
    highlights = set()

    print(f"\n{COLORS['bold']}{COLORS['green']}  ♟  ÉCHECS 1v1  ♟{COLORS['reset']}")
    print(f"  Tapez la case de départ puis la case d'arrivée (ex: e2 e4)")
    print(f"  Tapez 'aide a1' pour voir les coups légaux d'une pièce")
    input(f"  Appuyez sur Entrée pour commencer...")

    while True:
        king_pos = board.find_king(board.turn) if board.in_check(board.turn) else None
        board.display(highlights=highlights, check_king=king_pos)
        print_status(board)

        if board.is_checkmate():
            winner = 'Blancs' if board.turn == 'black' else 'Noirs'
            print(f"\n  {COLORS['bold']}{COLORS['green']}  ÉCHEC ET MAT ! Les {winner} gagnent !  {COLORS['reset']}")
            break
        if board.is_stalemate():
            print(f"\n  {COLORS['bold']}{COLORS['yellow']}  PAT ! Match nul.  {COLORS['reset']}")
            break
        if board.is_draw_50():
            print(f"\n  {COLORS['bold']}{COLORS['yellow']}  NULLE (règle des 50 coups).  {COLORS['reset']}")
            break

        try:
            line = input("\n  > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\n  Au revoir !")
            break

        if not line:
            continue

        if line in ['quitter', 'quit', 'q']:
            print("\n  Au revoir !")
            break

        parts = line.split()

        # Help: show legal moves for a square
        if parts[0] == 'aide' and len(parts) == 2:
            sq = parse_square(parts[1])
            if sq:
                p = board.at(*sq)
                if p and p.color == board.turn:
                    moves = board.legal_moves(*sq)
                    highlights = set(moves) | {sq}
                    if moves:
                        print(f"  {COLORS['green']}Coups: {', '.join(square_name(r,c) for r,c in moves)}{COLORS['reset']}")
                    else:
                        print(f"  {COLORS['red']}Aucun coup légal.{COLORS['reset']}")
                else:
                    print(f"  {COLORS['red']}Pas de pièce à cette case.{COLORS['reset']}")
            continue

        # Normal move: two squares
        if len(parts) >= 2:
            src = parse_square(parts[0])
            dst = parse_square(parts[1])
            if not src or not dst:
                print(f"  {COLORS['red']}Case invalide. Exemple: e2 e4{COLORS['reset']}")
                continue

            piece = board.at(*src)
            if not piece:
                print(f"  {COLORS['red']}Aucune pièce en {parts[0]}.{COLORS['reset']}")
                continue
            if piece.color != board.turn:
                print(f"  {COLORS['red']}Ce n'est pas votre pièce.{COLORS['reset']}")
                continue

            legal = board.legal_moves(*src)
            if dst not in legal:
                print(f"  {COLORS['red']}Coup illégal.{COLORS['reset']}")
                continue

            # Promotion check
            promotion = 'Q'
            if piece.kind == 'P' and (dst[0] == 0 or dst[0] == 7):
                promotion = get_promotion_choice()

            board.apply_move(src[0], src[1], dst[0], dst[1], promotion)
            highlights = {src, dst}

        else:
            print(f"  {COLORS['red']}Commande invalide. Entrez deux cases, ex: e2 e4{COLORS['reset']}")


if __name__ == '__main__':
    main()
