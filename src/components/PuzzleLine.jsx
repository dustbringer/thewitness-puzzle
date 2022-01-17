import * as React from "react";
import { styled } from "@mui/material/styles";

import useStateRef from "../hooks/useStateRef";
import PuzzleLineRaw from "./PuzzleLineRaw";
import PuzzleLineStart from "./PuzzleLineStart";

import Puzzle from "../classes/Puzzle";
import Direction from "../enums/Direction";
import {
  getDirX,
  getDirY,
  getDirInfo,
  reverseDir,
  isSameAxis,
  dirToSign,
  isHorizontal,
} from "../util/directionUtil";
import { getViewboxSize } from "../util/puzzleDisplayUtil";
import Orientation from "../enums/Orientation";
import { VtxSym, SpcSym, EdgSym } from "../enums/Sym";
import {
  PIECESZ,
  STARTRAD as _STARTRAD,
  LINEWIDTH as _LINEWIDTH,
  BREAKWIDTH as _BREAKWIDTH,
} from "./PuzzlePiece/info";

const pieceszScale = 2;
const EDGESEGMAX = PIECESZ * pieceszScale;
const LINERAD = (_LINEWIDTH / 2) * pieceszScale;
const STARTRAD = _STARTRAD * pieceszScale;
const BREAKWIDTH = _BREAKWIDTH * pieceszScale;
const moveCap = 60;
const perpCap = 30;

const capVal = (val, cap) => (Math.abs(val) > cap ? cap * Math.sign(val) : val);

function PuzzleLine({ puzzle, width }) {
  const [showLine, setShowLine] = React.useState(false);
  const [linePoints, setLinePoints, linePointsRef] = useStateRef([]);
  const [currDir, setCurrDir, currDirRef] = useStateRef(Direction.UP);
  const [currDist, setCurrDist, currDistRef] = useStateRef(0);

  const pointEquals = (p1, p2) => p1 && p2 && p1.x === p2.x && p1.y === p2.y;

  const endDir = (end) => {
    const o = puzzle.getEndOrientation(end.x, end.y);
    if (o === null) return null;

    // Orientation.VERTICAL check first as VERTICAL is default
    if (o === Orientation.VERTICAL) {
      if (end.y === 0) return Direction.UP;
      else return Direction.DOWN;
    } else if (o === Orientation.HORIZONTAL) {
      if (end.x === 0) return Direction.LEFT;
      else return Direction.RIGHT;
    } else {
      // TODO: account for Orientation.DIAGONAL
      console.log("Direction diagonal");
      return Direction.NONE;
    }
  };

  const isValidDir = (p, dir) => {
    const nextP = pointInDir(p, dir);
    return (
      (nextP !== null &&
        (puzzle.isVertexInGrid(nextP.x, nextP.y) ||
          puzzle.isEdgeInGrid(nextP.x, nextP.y)) &&
        !puzzle.isEmpty(nextP.x, nextP.y)) ||
        // TODO: account for diagonals
        // needs to check p before nextP is set
      (puzzle.isEnd(nextP.x, nextP.y) && dir === endDir(nextP))
    );
  };

  const isLineCrossingPoint = (dist) => dist + LINERAD > EDGESEGMAX - LINERAD;

  // Start could be on an edge
  const isLineCrossingStart = (distToLine, dist) =>
    dist + LINERAD > distToLine - STARTRAD;

  const isLineCrossingBreak = (dist) =>
    dist + LINERAD > (EDGESEGMAX - BREAKWIDTH) / 2;

  const pointInDir = (p, dir) =>
    dir !== Direction.NONE && p !== null
      ? isHorizontal(dir)
        ? { x: p.x + dirToSign(dir), y: p.y }
        : { x: p.x, y: p.y + dirToSign(dir) }
      : null;

  const vertInDir = (p, dir) => {
    if (dir === Direction.NONE) return null;

    let newPoint = pointInDir(p, dir);
    while (puzzle.isInGrid(newPoint.x, newPoint.y)) {
      if (
        puzzle.isVertexInGrid(newPoint.x, newPoint.y) ||
        puzzle.isEnd(newPoint.x, newPoint.y)
      ) {
        return newPoint;
      }
      newPoint = pointInDir(newPoint, dir);
    }

    return null;
  };

  const isBacktrackingPoint = (currP, prevP, dir) =>
    prevP !== null &&
    dir !== Direction.NONE &&
    (pointEquals(vertInDir(currP, dir), prevP) ||
      pointEquals(pointInDir(currP, dir), prevP));

  const containsPoint = (pArr, p) => pArr.some((e) => pointEquals(e, p));

  // potentially unnecessary functions
  const isSharedAxis = (p1, p2) => p1.x === p2.x || p1.y === p2.y;

  /*
  Returns the piece distance between two points on a shared axis
  */
  const sharedAxisDist = (p1, p2) => {
    if (p1 === null || p2 === null) return;

    const dist =
      Math.abs(p1.x - p2.x) > Math.abs(p1.y - p2.y)
        ? Math.abs(p1.x - p2.x)
        : Math.abs(p1.y - p2.y);

    return (EDGESEGMAX / 2) * dist;
  };

  const handleMouseMove = (e) => {
    // TODO: clicking escape should remove all line segments
    // TODO: end of puzzle
    // TODO: scale movement speed (can be used as sensitivity setting)

    const x = capVal(e.movementX, moveCap);
    const y = capVal(e.movementY, moveCap);

    if (x === 0 && y === 0) return;

    let updatedDist = currDistRef.current;
    let updatedDir = currDirRef.current;
    let distDiff =
      updatedDir !== Direction.NONE
        ? (isHorizontal(updatedDir) ? x : y) * dirToSign(updatedDir)
        : 0;

    const {
      xDir,
      yDir,
      xAbs,
      yAbs,
      maxDistAbs,
      minDistAbs,
      maxDist,
      minDist,
      maxDir,
      minDir,
    } = getDirInfo(x, y, updatedDir);

    // Current vertex that the line attaches to
    let currPoint =
      linePointsRef.current.length > 0
        ? linePointsRef.current[linePointsRef.current.length - 1]
        : null;
    let prevPoint =
      linePointsRef.current.length > 1
        ? linePointsRef.current[linePointsRef.current.length - 2]
        : null;
    let nextPoint =
      currPoint !== null ? pointInDir(currPoint, updatedDir) : null;
    let nextVertex =
      currPoint !== null ? vertInDir(currPoint, updatedDir) : null;

    // Replace NONE direction
    if (updatedDir === Direction.NONE) {
      updatedDir = maxDir;
    }

    // Turn assist (maxDir perpendicular to edge)
    if (
      !isSameAxis(maxDir, updatedDir) &&
      nextVertex !== null &&
      isValidDir(nextVertex, maxDir)
    ) {
      distDiff =
        (updatedDist > EDGESEGMAX / 2 ? 1 : -1) * capVal(maxDistAbs, perpCap);
      if (puzzle.isEdgeInGrid(currPoint.x, currPoint.y)) {
        distDiff = Math.abs(distDiff);
      }
    }

    updatedDist += distDiff;

    // Changing direction at vertex; prevent invalid movements
    if (updatedDist <= 0) {
      // Line moved backwards past vertex

      if (isValidDir(currPoint, maxDir)) {
        // Any mouse direction, next point exists
        updatedDir = maxDir;
        updatedDist = Math.abs(updatedDist);
      } else if (
        !isSameAxis(maxDir, updatedDir) &&
        isValidDir(currPoint, reverseDir(updatedDir))
      ) {
        // No next point in mouse direction, but next point exists in edge direction
        updatedDir = reverseDir(updatedDir);
        updatedDist = Math.abs(updatedDist);
      } else {
        updatedDist = 0;
      }
    } else if (
      updatedDist >= sharedAxisDist(currPoint, nextVertex) &&
      isValidDir(nextVertex, maxDir)
    ) {
      // Line moved forwards past vertex, and point in movement direction exists

      updatedDir = maxDir;
    }

    // Self collision
    // FIXME: probably needs refactoring
    // NOTE: POINT EXISTENCE MUST BE CHECKED BEFORE VERTEX
    const nextPointInLine = containsPoint(linePointsRef.current, nextPoint)
      ? nextPoint
      : containsPoint(linePointsRef.current, nextVertex)
      ? nextVertex
      : null;

    if (nextPointInLine !== null) {
      if (
        linePointsRef.current.length > 0 &&
        pointEquals(nextPointInLine, linePointsRef.current[0]) &&
        isLineCrossingStart(
          sharedAxisDist(currPoint, nextPointInLine),
          updatedDist + distDiff
        )
      ) {
        updatedDist =
          sharedAxisDist(currPoint, nextPointInLine) - LINERAD - STARTRAD;
      } else if (isLineCrossingPoint(updatedDist + distDiff)) {
        // move will cross over into next point
        updatedDist = EDGESEGMAX - LINERAD * 2;
      }
    }

    // check if new point should be added
    // FIXME: probably needs refactoring
    if (
      nextVertex !== null &&
      !pointEquals(currPoint, nextVertex) &&
      isSharedAxis(currPoint, nextVertex) &&
      updatedDist >= sharedAxisDist(currPoint, nextVertex)
    ) {
      setLinePoints((points) => [...points, nextVertex]);
      // possibly assign this distance to a variable
      updatedDist %= sharedAxisDist(currPoint, nextVertex);
      prevPoint = currPoint;
      currPoint = nextVertex;
      console.log("added point");
    }

    // FIXME: this probably should be somewhere else
    if (!isValidDir(currPoint, updatedDir)) {
      // Use minDir if maxDir is invalid
      if (minDir !== Direction.NONE && isValidDir(currPoint, minDir)) {
        updatedDir = minDir;
        updatedDist = minDistAbs;
      } else {
        updatedDist = 0;
      }
    }

    /*
     * When we change direction at a vertex, isBacktrackingPoint checks if
     * the new direction is going back into the previously drawn edge segment.
     * If so, remove the point we backtracked from and update the values of
     * the current line segment to feel like it is controlling the removed edge.
     */
    // check if last point needs removing
    if (isBacktrackingPoint(currPoint, prevPoint, updatedDir)) {
      setLinePoints((points) => {
        return points.slice(0, points.length - 1);
      });
      updatedDist = sharedAxisDist(currPoint, prevPoint) - updatedDist;
      updatedDir = reverseDir(updatedDir);
      console.log("removed point");
    }

    setCurrDist(updatedDist);
    setCurrDir(updatedDir);
  };

  const handleStart = (i) => {
    setLinePoints([puzzle.start[i]]);
    setCurrDist(0);
    setCurrDir(Direction.NONE);
    setShowLine(true);
  };

  const handleEnd = () => {
    // for when mouse clicks to exit
    // TODO: right click to exit, left click to keep the line
    console.log("Ended");

    setShowLine(false);

    // TODO: replace this with what we actually want
    setLinePoints((curr) => [curr[0]]);
    setCurrDist(0);
    setCurrDir(Direction.NONE);
  };

  return (
    <>
      {showLine && (
        <PuzzleLineRaw
          puzzle={puzzle}
          width={width}
          points={linePoints}
          currDir={currDir}
          currDist={currDist}
        />
      )}
      <PuzzleLineStart
        puzzle={puzzle}
        width={width}
        handleStart={handleStart}
        handleEnd={handleEnd}
        handleMouseMove={handleMouseMove}
      />
      <button
        style={{
          position: "relative",
          top: `${500 * getViewboxSize(puzzle).sizeRatio}px`,
        }}
        onClick={() => console.log(linePoints)}
      >
        Hi, I'm a button :)
      </button>
    </>
  );
}

export default PuzzleLine;
