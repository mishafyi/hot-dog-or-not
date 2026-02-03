#!/bin/bash
set -e

echo "=== Hot Dog or Not - Setup ==="
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required but not found"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "Error: node is required but not found"
    exit 1
fi

# Backend setup
echo "Setting up backend..."
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data results
cd ..

# Frontend setup
echo
echo "Setting up frontend..."
cd frontend
npm install
cd ..

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo
    echo "Created .env from .env.example"
    echo "Edit .env to add your OPENROUTER_API_KEY"
fi

echo
echo "=== Setup complete! ==="
echo
echo "Next steps:"
echo "  1. Add your OpenRouter API key to .env"
echo "  2. Add images to backend/data/test/hot_dog/ and backend/data/test/not_hot_dog/"
echo "  3. Start the backend:"
echo "     cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000"
echo "  4. Start the frontend (new terminal):"
echo "     cd frontend && npm run dev"
echo "  5. Open http://localhost:3000"
