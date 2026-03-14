FROM python:3.12-slim
RUN pip install --no-cache-dir flask numpy scipy
COPY server.py /app/
WORKDIR /app
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1
CMD ["python3", "server.py"]
