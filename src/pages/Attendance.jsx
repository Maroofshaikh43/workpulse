import * as faceapi from "face-api.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatLongDate, formatTime, getToday } from "../utils";

function getDistance(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function formatCheckTime(date) {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Attendance() {
  const { supabase, profile } = useOutletContext();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const autoCheckInTimerRef = useRef(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [registeredPhotoUrl, setRegisteredPhotoUrl] = useState("");
  const [companyConfig, setCompanyConfig] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState("");
  const [location, setLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [action, setAction] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attendanceState, setAttendanceState] = useState("not_checked_in");
  const [modelLoading, setModelLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [verifyTone, setVerifyTone] = useState("");
  const [gpsVerified, setGpsVerified] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifyConfidence, setVerifyConfidence] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");

  const attendanceRadius = companyConfig?.attendance_radius_meters ?? 200;
  const officeReady = useMemo(
    () =>
      companyConfig?.office_lat !== null &&
      companyConfig?.office_lng !== null &&
      companyConfig?.office_lat !== undefined &&
      companyConfig?.office_lng !== undefined,
    [companyConfig],
  );

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const clearAutoCheckInTimer = () => {
    if (autoCheckInTimerRef.current) {
      window.clearTimeout(autoCheckInTimerRef.current);
      autoCheckInTimerRef.current = null;
    }
  };

  const resetVerificationState = (keepGps = true) => {
    stopCamera();
    clearAutoCheckInTimer();
    setSelfiePreview("");
    setFaceVerified(false);
    setVerifyConfidence(null);
    setVerifyMessage("");
    setVerifyTone("");
    if (!keepGps) {
      setGpsVerified(false);
      setLocation(null);
      setDistance(null);
    }
  };

  const loadModels = async () => {
    try {
      setModelLoading(true);
      setModelStatus("Loading face verification...");

      const MODEL_URL = "https://cdn.jsdelivr.net/npm/face-api.js/weights";

      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      setModelStatus("Face verification ready");
    } catch (modelError) {
      console.error("Model loading error:", modelError);
      setError("Face verification models could not be loaded. Please refresh and try again.");
      setModelStatus("Face verification unavailable");
    } finally {
      setModelLoading(false);
    }
  };

  const fetchAttendancePageData = async () => {
    if (!profile?.id || !profile?.company_id) return null;

    setPageLoading(true);

    const today = getToday();
    const [
      { data: attendanceData, error: attendanceError },
      { data: userData, error: userError },
      { data: freshCompany, error: companyError },
    ] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", profile.id).eq("date", today).maybeSingle(),
      supabase.from("users").select("profile_photo_url").eq("id", profile.id).single(),
      supabase
        .from("companies")
        .select("office_lat, office_lng, attendance_radius_meters, status")
        .eq("id", profile.company_id)
        .single(),
    ]);

    if (attendanceError || userError || companyError) {
      setError(attendanceError?.message || userError?.message || companyError?.message || "Unable to load attendance data.");
      setPageLoading(false);
      return null;
    }

    setTodayAttendance(attendanceData ?? null);
    setRegisteredPhotoUrl(userData?.profile_photo_url ?? "");
    setCompanyConfig(freshCompany ?? null);

    if (attendanceData?.check_in_time && attendanceData?.check_out_time) {
      setAttendanceState("completed");
      setCheckInTime(formatTime(attendanceData.check_in_time));
      setCheckOutTime(formatTime(attendanceData.check_out_time));
    } else if (attendanceData?.check_in_time && !attendanceData?.check_out_time) {
      setAttendanceState("checked_in");
      setCheckInTime(formatTime(attendanceData.check_in_time));
      setCheckOutTime("");
    } else {
      setAttendanceState("not_checked_in");
      setCheckInTime("");
      setCheckOutTime("");
    }

    setPageLoading(false);
    return {
      attendance: attendanceData ?? null,
      profilePhotoUrl: userData?.profile_photo_url ?? "",
      company: freshCompany ?? null,
    };
  };

  useEffect(() => {
    fetchAttendancePageData();
    loadModels();

    return () => {
      stopCamera();
      clearAutoCheckInTimer();
    };
  }, [profile?.id, profile?.company_id]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  const openCamera = async () => {
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (cameraError) {
      setError(
        cameraError?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to continue."
          : `Camera access failed: ${cameraError.message}`,
      );
    }
  };

  const captureSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0);
    setSelfiePreview(canvas.toDataURL("image/jpeg", 0.92));
    setVerifyMessage("");
    setVerifyTone("");
    setVerifyConfidence(null);
    setFaceVerified(false);
    stopCamera();
  };

  const markCheckIn = async (isFaceVerified) => {
    try {
      setLoading(true);
      setAction("checkin");
      const now = new Date();
      const today = getToday();
      const time = now.toTimeString().slice(0, 8);

      const { data: existing, error: existingError } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", profile.id)
        .eq("date", today)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {
        setVerifyMessage("Already checked in today!");
        setVerifyTone("error");
        return;
      }

      const hour = now.getHours();
      const minute = now.getMinutes();
      const isLate = hour > 9 || (hour === 9 && minute > 30);

      const { error: insertError } = await supabase.from("attendance").insert({
        user_id: profile.id,
        company_id: profile.company_id,
        date: today,
        check_in_time: time,
        location_lat: location?.lat ?? null,
        location_lng: location?.lng ?? null,
        face_verified: isFaceVerified,
        status: isLate ? "late" : "present",
      });

      if (insertError) {
        throw insertError;
      }

      setAttendanceState("checked_in");
      setCheckInTime(formatCheckTime(now));
      setMessage(`Attendance marked successfully at ${formatCheckTime(now)}.`);
      setVerifyMessage("Checking you in...");
      setVerifyTone("success");
      resetVerificationState(false);
      await fetchAttendancePageData();
    } catch (markError) {
      console.error("markCheckIn error:", markError);
      setError(`Check in failed: ${markError.message}`);
    } finally {
      setLoading(false);
      setAction("");
      clearAutoCheckInTimer();
    }
  };

  const verifyFaces = async () => {
    try {
      if (!registeredPhotoUrl) {
        setError("Please upload profile photo in Profile settings before checking in.");
        return;
      }

      if (!canvasRef.current || !selfiePreview) {
        setVerifyMessage("Take a live selfie before verifying.");
        setVerifyTone("error");
        return;
      }

      setVerifying(true);
      setVerifyMessage("Analyzing faces...");
      setVerifyTone("pending");

      const profileImg = await faceapi.fetchImage(registeredPhotoUrl);
      const selfieImg = canvasRef.current;

      const profileDetection = await faceapi
        .detectSingleFace(profileImg)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const selfieDetection = await faceapi
        .detectSingleFace(selfieImg)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!profileDetection) {
        setVerifyMessage("Could not detect face in your profile photo. Please update your profile photo.");
        setVerifyTone("error");
        return;
      }

      if (!selfieDetection) {
        setVerifyMessage("Could not detect your face in selfie. Please ensure good lighting and face the camera directly.");
        setVerifyTone("error");
        setSelfiePreview("");
        return;
      }

      const distanceBetweenFaces = faceapi.euclideanDistance(profileDetection.descriptor, selfieDetection.descriptor);
      const confidence = Math.max(0, Math.round((1 - distanceBetweenFaces) * 100));
      const isMatch = distanceBetweenFaces < 0.5;

      console.log("Face distance:", distanceBetweenFaces);

      setVerifyConfidence(confidence);

      if (isMatch) {
        setVerifyMessage(`Face verified ✓ ${confidence}% match`);
        setVerifyTone("success");
        setFaceVerified(true);
        autoCheckInTimerRef.current = window.setTimeout(() => {
          markCheckIn(true);
        }, 1000);
        return;
      }

      setAttempts((current) => {
        const nextAttempts = current + 1;

        if (nextAttempts >= 3) {
          setBlocked(true);
          setVerifyMessage("Too many failed attempts. Please contact your HR or Admin.");
          setVerifyTone("error");
        } else {
          setVerifyMessage(`Face did not match ✗ ${confidence}% match. Attempt ${nextAttempts} of 3. Please retake selfie.`);
          setVerifyTone("error");
          setSelfiePreview("");
        }

        return nextAttempts;
      });
    } catch (verifyError) {
      console.error("Face verify error:", verifyError);
      setVerifyMessage("Verification error. Please try again.");
      setVerifyTone("error");
      setSelfiePreview("");
    } finally {
      setVerifying(false);
    }
  };

  const verifyLocation = async () => {
    setError("");
    setMessage("");
    resetVerificationState(false);
    setAttempts(0);
    setBlocked(false);

    if (modelLoading) {
      setError("Face verification is still loading. Please wait a moment.");
      return;
    }

    if (!registeredPhotoUrl) {
      setError("Please upload profile photo in Profile settings before checking in.");
      return;
    }

    const freshData = await fetchAttendancePageData();
    const nextCompany = freshData?.company ?? companyConfig;

    if (
      !nextCompany ||
      nextCompany.office_lat === null ||
      nextCompany.office_lat === undefined ||
      nextCompany.office_lng === null ||
      nextCompany.office_lng === undefined
    ) {
      setError("Your admin has not set the office location yet. Please contact your admin to set the office GPS coordinates in Company Settings.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const nextDistance = getDistance(
          nextLocation.lat,
          nextLocation.lng,
          nextCompany.office_lat,
          nextCompany.office_lng,
        );

        setLocation(nextLocation);
        setDistance(nextDistance);

        if (nextDistance > attendanceRadius) {
          stopCamera();
          setGpsVerified(false);
          setError(`You are ${Math.round(nextDistance)}m away from office. Must be within ${attendanceRadius}m to check in.`);
          return;
        }

        setGpsVerified(true);
        setVerifyMessage("");
        setVerifyTone("");
        setMessage(`GPS verified within ${Math.round(nextDistance)} meters. Camera unlocked.`);
        await openCamera();
      },
      (geoError) => setError(`Location access failed: ${geoError.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const markCheckOut = async () => {
    const { data: reportSubmission } = await supabase
      .from("daily_report_submissions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("date", getToday())
      .maybeSingle();

    if (!reportSubmission) {
      setError("Complete today's daily report before checking out.");
      return;
    }

    setLoading(true);
    setAction("checkout");
    setError("");
    setMessage("");
    const now = new Date();
    const checkoutTimeValue = now.toTimeString().slice(0, 8);
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ check_out_time: checkoutTimeValue })
      .eq("user_id", profile.id)
      .eq("date", getToday());

    setLoading(false);
    setAction("");

    if (updateError) {
      setError(`Check out failed: ${updateError.message}`);
      return;
    }

    setAttendanceState("completed");
    setCheckOutTime(formatCheckTime(now));
    setMessage(`Check-out recorded successfully at ${formatCheckTime(now)}.`);
    await fetchAttendancePageData();
  };

  if (pageLoading || modelLoading) {
    return (
      <section className="panel empty-state attendance-model-loading">
        <div className="attendance-spinner" />
        <strong>Loading face verification system...</strong>
        <p>{modelStatus || "Preparing attendance..."}</p>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <canvas ref={canvasRef} className="attendance-hidden-canvas" />

      <div className="panel">
        <div className="section-header">
          <h2>Attendance</h2>
          <p>{formatLongDate()}.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        <div className="stat-grid">
          <div className="stat-card">
            <span>Today</span>
            <strong>{attendanceState === "completed" ? "Completed" : todayAttendance?.status ?? "Not marked"}</strong>
          </div>
          <div className="stat-card">
            <span>Check In</span>
            <strong>{checkInTime || formatTime(todayAttendance?.check_in_time)}</strong>
          </div>
          <div className="stat-card">
            <span>Check Out</span>
            <strong>{checkOutTime || formatTime(todayAttendance?.check_out_time)}</strong>
          </div>
          <div className="stat-card">
            <span>Allowed Radius</span>
            <strong>{attendanceRadius}m</strong>
          </div>
        </div>
      </div>

      <div className="grid-two responsive">
        <div className="panel">
          <div className="section-header">
            <h3>Step 1: GPS Verification</h3>
            <p>Verify your current location to unlock the face verification flow.</p>
          </div>
          <div className="stack">
            <div className="mini-card">
              <strong>Today's Date</strong>
              <p>{formatLongDate()}</p>
            </div>

            {attendanceState === "checked_in" ? (
              <div className="mini-card attendance-state-card success">
                <strong>You checked in at {checkInTime || formatTime(todayAttendance?.check_in_time)} ✓</strong>
                <p>Face verification passed and your attendance is active for today.</p>
              </div>
            ) : null}

            {attendanceState === "completed" ? (
              <div className="mini-card attendance-state-card success">
                <strong>Attendance completed for today ✓</strong>
                <p>Check in: {checkInTime || formatTime(todayAttendance?.check_in_time)}</p>
                <p>Check out: {checkOutTime || formatTime(todayAttendance?.check_out_time)}</p>
                <p>See you tomorrow!</p>
              </div>
            ) : null}

            <div className="mini-card">
              <strong>Your registered face</strong>
              {registeredPhotoUrl ? (
                <img src={registeredPhotoUrl} alt="Your registered face" className="photo-preview comparison-photo" />
              ) : (
                <p>Please upload profile photo in Profile settings before checking in.</p>
              )}
            </div>

            {attendanceState === "not_checked_in" ? (
              <button
                type="button"
                className="primary-button"
                onClick={verifyLocation}
                disabled={loading || verifying || blocked || !registeredPhotoUrl || !officeReady}
              >
                Verify GPS
              </button>
            ) : null}

            {!officeReady ? (
              <div className="mini-card">
                <p>Camera is locked until your company office location is configured.</p>
              </div>
            ) : null}

            {location ? (
              <div className="mini-card">
                <p>
                  Current location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                {distance !== null ? <p>Distance from office: {Math.round(distance)} meters</p> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>Step 2: Face Verification</h3>
            <p>Capture a live selfie and compare it with your registered profile photo.</p>
          </div>

          {attendanceState === "not_checked_in" && !gpsVerified && !cameraOpen && !selfiePreview ? (
            <div className="empty-state">Camera is locked until GPS verification succeeds inside the office radius.</div>
          ) : null}

          {attendanceState === "not_checked_in" && gpsVerified && !cameraOpen && !selfiePreview && !blocked ? (
            <div className="stack">
              <div className="comparison-grid">
                <div className="mini-card">
                  <strong>Registered</strong>
                  <img src={registeredPhotoUrl} alt="Registered photo" className="photo-preview comparison-photo" />
                </div>
              </div>
              <button type="button" className="primary-button" onClick={openCamera} disabled={loading || verifying}>
                Open Camera
              </button>
            </div>
          ) : null}

          {cameraOpen ? (
            <div className="stack">
              <div className="comparison-grid">
                <div className="mini-card">
                  <strong>Your registered face</strong>
                  <img src={registeredPhotoUrl} alt="Registered photo" className="photo-preview comparison-photo" />
                </div>
                <div className="mini-card">
                  <strong>Live Camera</strong>
                  <video ref={videoRef} autoPlay playsInline className="camera-view comparison-photo" />
                </div>
              </div>
              <div className="row-end">
                <button type="button" className="ghost-button" onClick={stopCamera} disabled={verifying}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={captureSelfie} disabled={verifying}>
                  Take Selfie
                </button>
              </div>
            </div>
          ) : null}

          {selfiePreview ? (
            <div className="stack">
              <div className={`attendance-verify-stage${verifying ? " is-verifying" : ""}`}>
                <div className="comparison-grid">
                  <div className="mini-card">
                    <strong>Registered</strong>
                    <img src={registeredPhotoUrl} alt="Registered photo" className="photo-preview comparison-photo" />
                  </div>
                  <div className="mini-card">
                    <strong>Live Selfie</strong>
                    <img src={selfiePreview} alt="Live selfie" className="photo-preview comparison-photo" />
                  </div>
                </div>
                {verifying ? (
                  <div className="attendance-verify-overlay">
                    <div className="attendance-spinner" />
                    <strong>AI is comparing faces...</strong>
                  </div>
                ) : null}
              </div>

              {verifyMessage ? (
                <div className={`attendance-verify-message ${verifyTone || "pending"}`}>
                  <strong>
                    {faceVerified
                      ? "Verification successful"
                      : blocked
                        ? "Verification blocked"
                        : verifyTone === "error"
                          ? "Face did not match"
                          : "Verification status"}
                  </strong>
                  <p>{verifyMessage}</p>
                  {verifyConfidence !== null && !faceVerified ? <p>Confidence: {verifyConfidence}%</p> : null}
                  {attempts > 0 && !faceVerified ? <p>Attempt {attempts} of 3</p> : null}
                </div>
              ) : null}

              {!blocked && !faceVerified ? (
                <div className="row-end">
                  <button type="button" className="ghost-button" onClick={() => setSelfiePreview("")} disabled={verifying}>
                    Retake
                  </button>
                  <button type="button" className="primary-button" onClick={verifyFaces} disabled={verifying || loading}>
                    Verify Face
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {blocked ? (
            <div className="alert error">
              Too many failed attempts. Please contact your HR or Admin.
            </div>
          ) : null}

          {attendanceState === "checked_in" ? (
            <div className="row-end">
              <button
                type="button"
                className="ghost-button"
                onClick={markCheckOut}
                disabled={loading || !todayAttendance?.check_in_time}
              >
                {loading && action === "checkout" ? "Checking out..." : "Check Out"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
